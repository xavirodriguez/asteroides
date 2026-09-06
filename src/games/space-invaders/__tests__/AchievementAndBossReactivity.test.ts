import { World, SystemPhase, EventBus } from "@tiny-aster/core";
import { AchievementSystem } from "@tiny-aster/gameplay-kit";
import { BossSystem } from "../systems/BossSystem";
import { PersistenceService } from "../../../services/PersistenceService";

jest.mock("../../../services/PersistenceService", () => ({
  PersistenceService: {
    save: jest.fn().mockResolvedValue(undefined),
    load: jest.fn().mockResolvedValue({})
  }
}));

describe("AchievementSystem and BossSystem Reactivity", () => {
  let world: World<any>;
  let eventBus: EventBus<any>;
  let achievementSystem: AchievementSystem;
  let bossSystem: BossSystem;

  beforeEach(() => {
    jest.clearAllMocks();
    world = new World<any>();
    eventBus = new EventBus<any>();
    world.setResource("EventBus", eventBus);

    // Set up default GameConfig for BossSystem
    world.setResource("GameConfig", {
      INVADER_SPEED: 50
    });

    const storageAdapter = {
      getItem: async (key: string) => {
        const val = await PersistenceService.load(key, {});
        return val && Object.keys(val).length > 0 ? JSON.stringify(val) : null;
      },
      setItem: async (key: string, value: string) => {
        await PersistenceService.save(key, JSON.parse(value));
      }
    };

    achievementSystem = new AchievementSystem(storageAdapter);
    bossSystem = new BossSystem();

    world.addSystem(achievementSystem, { phase: SystemPhase.Simulation });
    world.addSystem(bossSystem, { phase: SystemPhase.Simulation });
  });

  describe("AchievementSystem", () => {
    it("should load existing achievements from PersistenceService on registration", async () => {
      // Setup load mock to return that combo_king is already unlocked
      (PersistenceService.load as jest.Mock).mockResolvedValueOnce({ combo_king: true });

      const testWorld = new World<any>();
      testWorld.setResource("EventBus", eventBus);
      const storageAdapter = {
        getItem: async (key: string) => {
          const val = await PersistenceService.load(key, {});
          return val && Object.keys(val).length > 0 ? JSON.stringify(val) : null;
        },
        setItem: async (key: string, value: string) => {
          await PersistenceService.save(key, JSON.parse(value));
        }
      };
      const testSystem = new AchievementSystem(storageAdapter);
      testWorld.addSystem(testSystem, { phase: SystemPhase.Simulation });

      // Allow microtask queue to flush the promise
      await new Promise(process.nextTick);

      const achievements = testSystem.getAchievements();
      const comboKing = achievements.find(a => a.id === "combo_king");
      expect(comboKing?.unlocked).toBe(true);
    });

    it("should unlock combo_king when combo chain reaches 10 and persist it", () => {
      let unlockedEventEmitted = false;
      eventBus.on("achievement:unlocked", (payload: any) => {
        expect(payload.achievement.id).toBe("combo_king");
        unlockedEventEmitted = true;
      });

      // Emit high-value combo hit
      eventBus.emit("si:kill", { chain: 10 });
      eventBus.flushDeferred();

      expect(unlockedEventEmitted).toBe(true);
      expect(PersistenceService.save).toHaveBeenCalledWith("unlocked_achievements", { combo_king: true });
    });

    it("should unlock invader_slayer when 50 invaders are killed", () => {
      let unlockedEventEmitted = false;
      eventBus.on("achievement:unlocked", (payload: any) => {
        expect(payload.achievement.id).toBe("invader_slayer");
        unlockedEventEmitted = true;
      });

      // Destroy 50 invaders
      for (let i = 0; i < 50; i++) {
        eventBus.emit("entity:destroyed", { type: "Invader" });
      }
      eventBus.flushDeferred();

      expect(unlockedEventEmitted).toBe(true);
      expect(PersistenceService.save).toHaveBeenCalledWith("unlocked_achievements", { invader_slayer: true });
    });
  });

  describe("BossSystem Event Reactivity", () => {
    let bossEntity: number;

    beforeEach(() => {
      bossEntity = world.createEntity();
      world.addComponent(bossEntity, {
        type: "Boss",
        hp: 100,
        maxHp: 100,
        timer: 0,
        phase: 1
      } as any);
      world.addComponent(bossEntity, {
        type: "Transform",
        x: 400,
        y: 100,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        worldX: 400,
        worldY: 100,
        worldRotation: 0,
        worldScaleX: 1,
        worldScaleY: 1,
        dirty: false
      } as any);
      world.addComponent(bossEntity, {
        type: "Render",
        shape: "boss",
        size: 50,
        color: "#F0F",
        visible: true,
        opacity: 1
      } as any);
      world.addComponent(bossEntity, {
        type: "GameState",
        lives: 3,
        level: 1,
        isGameOver: false
      } as any);
    });

    it("should enter Fury Mode when high-value kills are emitted", () => {
      const bossBefore = world.getComponent(bossEntity, "Boss") as any;
      expect(bossBefore.fury ?? 0).toBe(0);

      // Emit high combo kill
      eventBus.emit("si:kill", { chain: 5 });

      const bossAfter = world.getComponent(bossEntity, "Boss") as any;
      expect(bossAfter.fury).toBe(40); // fury increased!

      // Emit another to cross fury threshold (> 50)
      eventBus.emit("si:kill", { chain: 6 });

      const bossFurious = world.getComponent(bossEntity, "Boss") as any;
      expect(bossFurious.fury).toBe(80);
      expect(bossFurious.furyDuration).toBe(3.0);
    });

    it("should trigger counterFirePending when a Shield segment is destroyed", () => {
      const bossBefore = world.getComponent(bossEntity, "Boss") as any;
      expect(bossBefore.counterFirePending).toBeUndefined();

      // Emit shield segment destroyed
      eventBus.emit("entity:destroyed", { type: "Shield" });

      const bossAfter = world.getComponent(bossEntity, "Boss") as any;
      expect(bossAfter.counterFirePending).toBe(true);

      // Running update should process and reset the counter fire trigger
      world.update(0.016);

      const bossReset = world.getComponent(bossEntity, "Boss") as any;
      expect(bossReset.counterFirePending).toBe(false);
    });
  });
});
