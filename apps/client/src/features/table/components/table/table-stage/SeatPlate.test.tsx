/**
 * @vitest-environment happy-dom
 */
import { render } from "@testing-library/react";
import { SeatPlate } from "./SeatPlate";

describe("SeatPlate", () => {
  it("renders active gift badge correctly", () => {
    const { getByText } = render(
      <SeatPlate
        name="Test User"
        stackDisplay="100"
        cardFacePackId="simple"
        activeGift={{ emoji: "🎁" }}
      />
    );

    const emojiNode = getByText("🎁");
    expect(emojiNode).toBeTruthy();
  });
});
