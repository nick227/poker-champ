import { describe, it, expectTypeOf } from "vitest";
import type { TablePageController } from "@/types/tableSceneContract";
import { useTablePageController } from "../features/table-page/useTablePageController";

describe("table page controller contract", () => {
  it("keeps useTablePageController aligned with TablePageController", () => {
    type Controller = ReturnType<typeof useTablePageController>;
    expectTypeOf<Controller>().toMatchTypeOf<TablePageController>();
    expectTypeOf<TablePageController>().toMatchTypeOf<Controller>();
  });

  it("exposes required top-level sections", () => {
    type Controller = ReturnType<typeof useTablePageController>;
    expectTypeOf<Controller["scene"]>().toEqualTypeOf<TablePageController["scene"]>();
    expectTypeOf<Controller["renderModel"]>().toEqualTypeOf<TablePageController["renderModel"]>();
    expectTypeOf<Controller["uiState"]>().toEqualTypeOf<TablePageController["uiState"]>();
    expectTypeOf<Controller["actions"]>().toEqualTypeOf<TablePageController["actions"]>();
  });
});

