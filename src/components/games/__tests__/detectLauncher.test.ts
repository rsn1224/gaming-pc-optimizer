import { describe, expect, it } from "vitest";
import { detectLauncher } from "../GameCard";

describe("detectLauncher", () => {
  it('returns "steam" for paths containing "steam"', () => {
    expect(detectLauncher("C:/Program Files (x86)/Steam/steamapps/common/Game/game.exe")).toBe("steam");
    expect(detectLauncher("C:/steam/games/example.exe")).toBe("steam");
  });

  it('returns "steam" case-insensitively', () => {
    expect(detectLauncher("C:/STEAM/apps/game.exe")).toBe("steam");
    expect(detectLauncher("C:/SteamLibrary/game.exe")).toBe("steam");
  });

  it('returns "epic" for Epic Games paths', () => {
    expect(detectLauncher("C:/Program Files/Epic Games/Fortnite/game.exe")).toBe("epic");
    expect(detectLauncher("C:/epic games/title/bin/game.exe")).toBe("epic");
  });

  it('returns "battlenet" for Battle.net paths', () => {
    expect(detectLauncher("C:/Program Files (x86)/Battle.net/games/game.exe")).toBe("battlenet");
    expect(detectLauncher("C:/battlenet/game.exe")).toBe("battlenet");
  });

  it('returns "custom" for unrecognized paths', () => {
    expect(detectLauncher("C:/Games/MyGame/game.exe")).toBe("custom");
    expect(detectLauncher("D:/custom/launcher/game.exe")).toBe("custom");
    expect(detectLauncher("")).toBe("custom");
  });

  it("uses substring match — any path segment containing the keyword matches", () => {
    // "steamroller" contains "steam" as substring → matches steam
    expect(detectLauncher("C:/Games/steamroller/game.exe")).toBe("steam");
  });
});
