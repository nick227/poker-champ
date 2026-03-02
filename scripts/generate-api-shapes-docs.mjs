import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const OPENAPI_PATH = path.resolve(ROOT, "openapi.json");
const ENDPOINTS_PATH = path.resolve(ROOT, "packages/sdk/src/endpoints.ts");
const OUTPUT_DIR = path.resolve(ROOT, "docs/api-shapes");
const OUTPUT_JSON_PATH = path.resolve(OUTPUT_DIR, "data.json");
const SOURCE_HASH_PATH = path.resolve(OUTPUT_DIR, "source.hash");

const HTTP_METHODS = ["get", "put", "post", "delete", "patch", "options", "head", "trace"];

function decodeRefSegment(segment) {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function refNameFromRef(ref) {
  const parts = ref.split("/");
  return decodeRefSegment(parts[parts.length - 1] ?? "");
}

function normalizeSdkPath(rawPath) {
  if (!rawPath.includes("${")) return rawPath;
  let paramIndex = 0;
  return rawPath.replace(/\$\{[^}]+\}/g, () => {
    paramIndex += 1;
    return `{param${paramIndex}}`;
  });
}

function pathsEquivalent(a, b) {
  const aParts = a.split("/").filter(Boolean);
  const bParts = b.split("/").filter(Boolean);
  if (aParts.length !== bParts.length) return false;
  for (let i = 0; i < aParts.length; i += 1) {
    const left = aParts[i];
    const right = bParts[i];
    const leftParam = left.startsWith("{") && left.endsWith("}");
    const rightParam = right.startsWith("{") && right.endsWith("}");
    if (!leftParam && !rightParam && left !== right) return false;
  }
  return true;
}

function parseSdkMethods(endpointsSource) {
  const methods = [];
  const namespaceRegex = /export const (\w+)\s*=\s*{([\s\S]*?)\n};/g;
  let namespaceMatch = namespaceRegex.exec(endpointsSource);
  while (namespaceMatch) {
    const namespace = namespaceMatch[1];
    const body = namespaceMatch[2];
    const methodRegex =
      /(\w+):\s*\(([\s\S]*?)\)\s*=>[\s\S]*?request<[\s\S]*?>\(\s*"([A-Z]+)"\s*,\s*(?:"([^"]+)"|pathWithParams\("([^"]+)"|`([^`]+)`)/g;
    let methodMatch = methodRegex.exec(body);
    while (methodMatch) {
      const methodName = methodMatch[1];
      const httpMethod = methodMatch[3];
      const rawPath = methodMatch[4] ?? methodMatch[5] ?? methodMatch[6] ?? "";
      methods.push({
        namespace,
        methodName,
        httpMethod,
        rawPath,
        normalizedPath: normalizeSdkPath(rawPath),
      });
      methodMatch = methodRegex.exec(body);
    }
    namespaceMatch = namespaceRegex.exec(endpointsSource);
  }
  return methods;
}

function shapeSchema(schema, components, trail = []) {
  if (!schema) return { kind: "unknown" };

  if (schema.$ref) {
    const refName = refNameFromRef(schema.$ref);
    if (trail.includes(refName)) {
      return { kind: "ref", ref: refName, circular: true };
    }
    const target = components[refName];
    if (!target) {
      return { kind: "ref", ref: refName, missing: true };
    }
    return {
      kind: "ref",
      ref: refName,
      target: shapeSchema(target, components, [...trail, refName]),
    };
  }

  if (Array.isArray(schema.oneOf)) {
    return {
      kind: "oneOf",
      variants: schema.oneOf.map((item) => shapeSchema(item, components, trail)),
      description: schema.description,
    };
  }

  if (Array.isArray(schema.anyOf)) {
    return {
      kind: "anyOf",
      variants: schema.anyOf.map((item) => shapeSchema(item, components, trail)),
      description: schema.description,
    };
  }

  if (Array.isArray(schema.allOf)) {
    return {
      kind: "allOf",
      variants: schema.allOf.map((item) => shapeSchema(item, components, trail)),
      description: schema.description,
    };
  }

  if (schema.enum) {
    return {
      kind: "enum",
      type: schema.type ?? "string",
      values: schema.enum,
      nullable: Boolean(schema.nullable),
      description: schema.description,
    };
  }

  if (schema.type === "array" || schema.items) {
    return {
      kind: "array",
      items: shapeSchema(schema.items, components, trail),
      nullable: Boolean(schema.nullable),
      description: schema.description,
    };
  }

  if (schema.type === "object" || schema.properties || schema.additionalProperties) {
    const required = new Set(schema.required ?? []);
    const properties = Object.entries(schema.properties ?? {}).reduce((acc, [name, value]) => {
      acc[name] = {
        required: required.has(name),
        shape: shapeSchema(value, components, trail),
      };
      return acc;
    }, {});

    let additionalProperties = undefined;
    if (schema.additionalProperties === true) additionalProperties = { kind: "any" };
    if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      additionalProperties = shapeSchema(schema.additionalProperties, components, trail);
    }

    return {
      kind: "object",
      nullable: Boolean(schema.nullable),
      description: schema.description,
      properties,
      additionalProperties,
    };
  }

  if (schema.type) {
    return {
      kind: "scalar",
      type: schema.type,
      format: schema.format,
      nullable: Boolean(schema.nullable),
      description: schema.description,
    };
  }

  return { kind: "unknown", description: schema.description };
}

function resolveJsonSchema(contentObject) {
  if (!contentObject || typeof contentObject !== "object") return null;
  if (contentObject["application/json"]?.schema) return contentObject["application/json"].schema;
  const firstContent = Object.values(contentObject)[0];
  if (!firstContent || typeof firstContent !== "object") return null;
  return firstContent.schema ?? null;
}

function collectParameters(pathItem, operation) {
  const combined = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])];
  const keyMap = new Map();
  for (const param of combined) {
    const key = `${param.in}:${param.name}`;
    keyMap.set(key, param);
  }
  return [...keyMap.values()];
}

async function main() {
  const [openapiRaw, endpointsRaw] = await Promise.all([
    fs.readFile(OPENAPI_PATH, "utf8"),
    fs.readFile(ENDPOINTS_PATH, "utf8"),
  ]);
  const openapi = JSON.parse(openapiRaw);
  const components = openapi.components?.schemas ?? {};
  const sdkMethods = parseSdkMethods(endpointsRaw);
  const sourceHash = crypto.createHash("sha256").update(openapiRaw).update("\n---\n").update(endpointsRaw).digest("hex");

  const operations = [];
  for (const [pathName, pathItem] of Object.entries(openapi.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op) continue;

      const params = collectParameters(pathItem, op);
      const pathParams = params.filter((p) => p.in === "path");
      const queryParams = params.filter((p) => p.in === "query");

      const requestSchema = resolveJsonSchema(op.requestBody?.content);

      const responses = Object.entries(op.responses ?? {}).map(([statusCode, response]) => ({
        statusCode,
        description: response?.description,
        typePath: response?.content ? `paths["${pathName}"]["${method}"]["responses"]["${statusCode}"]["content"]["application/json"]` : null,
        shape: shapeSchema(resolveJsonSchema(response?.content), components),
      }));

      const sdkMatches = sdkMethods
        .filter((item) => item.httpMethod.toLowerCase() === method && pathsEquivalent(item.normalizedPath, pathName))
        .map((item) => ({
          namespace: item.namespace,
          methodName: item.methodName,
          rawPath: item.rawPath,
        }));

      operations.push({
        operationId: op.operationId ?? `${method.toUpperCase()} ${pathName}`,
        summary: op.summary ?? null,
        description: op.description ?? null,
        method: method.toUpperCase(),
        path: pathName,
        typePath: `paths["${pathName}"]["${method}"]`,
        sdkMatches,
        request: {
          pathParams: pathParams.map((param) => ({
            name: param.name,
            required: Boolean(param.required),
            description: param.description ?? null,
            shape: shapeSchema(param.schema, components),
          })),
          queryParams: queryParams.map((param) => ({
            name: param.name,
            required: Boolean(param.required),
            description: param.description ?? null,
            shape: shapeSchema(param.schema, components),
          })),
          body: shapeSchema(requestSchema, components),
          bodyTypePath: requestSchema ? `paths["${pathName}"]["${method}"]["requestBody"]["content"]["application/json"]` : null,
        },
        responses,
      });
    }
  }

  operations.sort((a, b) => `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`));

  const componentModels = Object.keys(components)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      typePath: `components["schemas"]["${name}"]`,
      shape: shapeSchema(components[name], components, [name]),
    }));

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      openapi: path.relative(ROOT, OPENAPI_PATH).replaceAll("\\", "/"),
      sdkEndpoints: path.relative(ROOT, ENDPOINTS_PATH).replaceAll("\\", "/"),
      hash: sourceHash,
    },
    info: openapi.info ?? null,
    counts: {
      operations: operations.length,
      models: componentModels.length,
      sdkMethods: sdkMethods.length,
    },
    sdkNamespaces: [...new Set(sdkMethods.map((m) => m.namespace))].sort((a, b) => a.localeCompare(b)),
    operations,
    models: componentModels,
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_JSON_PATH, JSON.stringify(payload, null, 2));
  await fs.writeFile(SOURCE_HASH_PATH, `${sourceHash}\n`);

  console.log(
    `Generated ${path.relative(ROOT, OUTPUT_JSON_PATH)} and ${path.relative(ROOT, SOURCE_HASH_PATH)} (${operations.length} operations, ${componentModels.length} models)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
