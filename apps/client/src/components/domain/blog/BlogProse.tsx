import { View } from "react-native";
import { useRouter } from "expo-router";
import { Text as RNText } from "react-native";
import { Text } from "@/components/base/Text";
import { parseMarkdown, type Block, type Inline } from "./blogMarkdown";

function InlineSegments({ content }: { content: Inline[] }) {
  const router = useRouter();
  return (
    <RNText>
      {content.map((run, i) => {
        if (run.type === "text") return <RNText key={i}>{run.value}</RNText>;
        if (run.type === "bold")
          return (
            <RNText key={i} className="font-semibold">
              {run.value}
            </RNText>
          );
        return (
          <RNText
            key={i}
            onPress={() => run.url.startsWith("/") && router.push(run.url as "/lobby" | "/lessons" | (string & {}))}
            className="text-accent underline"
          >
            {run.text}
          </RNText>
        );
      })}
    </RNText>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.type === "h2") {
    return (
      <View className="mt-6 mb-2">
        <Text variant="h1" className="text-lg">
          <InlineSegments content={block.content} />
        </Text>
      </View>
    );
  }
  if (block.type === "h3") {
    return (
      <View className="mt-4 mb-1">
        <Text variant="h2" className="text-base">
          <InlineSegments content={block.content} />
        </Text>
      </View>
    );
  }
  return (
    <View className="mb-3">
      <Text variant="body">
        <InlineSegments content={block.content} />
      </Text>
    </View>
  );
}

type BlogProseProps = {
  body: string;
};

export function BlogProse({ body }: BlogProseProps) {
  const blocks = parseMarkdown(body);
  return (
    <View className="max-w-[720px] self-center">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </View>
  );
}
