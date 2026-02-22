import { describe, it, expectTypeOf } from "vitest";
import type { TableScreenController } from "@/types/tableSceneContract";
import { useTableScreenController } from "../../app/table/useTableScreenController";

describe("table screen controller contract", () => {
  it("keeps useTableScreenController aligned with TableScreenController", () => {
    type Controller = ReturnType<typeof useTableScreenController>;
    expectTypeOf<Controller>().toMatchTypeOf<TableScreenController>();
    expectTypeOf<TableScreenController>().toMatchTypeOf<Controller>();
  });

  it("exposes required top-level sections", () => {
    type Controller = ReturnType<typeof useTableScreenController>;
    expectTypeOf<Controller["scene"]>().toEqualTypeOf<TableScreenController["scene"]>();
    expectTypeOf<Controller["renderModel"]>().toEqualTypeOf<TableScreenController["renderModel"]>();
    expectTypeOf<Controller["uiState"]>().toEqualTypeOf<TableScreenController["uiState"]>();
    expectTypeOf<Controller["actions"]>().toEqualTypeOf<TableScreenController["actions"]>();
  });
});
