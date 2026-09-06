import { ConfigService } from "../src/config/ConfigService";
import { PlatformerConfigSchema, DEFAULT_PLATFORMER_CONFIG } from "../../../src/games/platformer/types/PlatformerConfigSchema";
import { EchoRunnerConfigSchema, DEFAULT_ECHO_RUNNER_CONFIG } from "../../../src/games/echorunner/types/EchoRunnerConfigSchema";
import { FlappyBirdConfigSchema, DEFAULT_FLAPPY_BIRD_CONFIG } from "../../../src/games/flappybird/types/FlappyBirdConfigSchema";
import { SpaceInvadersConfigSchema, DEFAULT_SPACE_INVADERS_CONFIG } from "../../../src/games/space-invaders/types/SpaceInvadersConfigSchema";
import { AsteroidConfigSchema, DEFAULT_ASTEROID_CONFIG } from "../../../src/games/asteroids/types/AsteroidConfigSchema";
import { GeometryWarsConfigSchema, DEFAULT_GEOMETRYWARS_CONFIG } from "../../../src/games/geometrywars/config/GeometryWarsConfig";
import { PongConfigSchema, DEFAULT_PONG_CONFIG } from "../../../src/games/pong/types/PongConfigSchema";

describe("Arcade Minigame Config Schemas", () => {
  describe("PlatformerConfigSchema", () => {
    it("safeParse({}) produces default values matching former flat object and DEFAULT_PLATFORMER_CONFIG", () => {
      const parsed = PlatformerConfigSchema.safeParse({});
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.SCREEN_WIDTH).toBe(800);
        expect(parsed.data.SCREEN_HEIGHT).toBe(600);
        expect(parsed.data.TILE_SIZE).toBe(40);
        expect(parsed.data.PLAYER_SPEED).toBe(200);
        expect(parsed.data.PLAYER_ACCEL).toBe(800);
        expect(parsed.data.PLAYER_DECEL).toBe(1200);
        expect(parsed.data.PLAYER_JUMP_VEL).toBe(350);
        expect(parsed.data.RISE_GRAVITY).toBe(800);
        expect(parsed.data.FALL_GRAVITY).toBe(1200);
        expect(parsed.data).toEqual(DEFAULT_PLATFORMER_CONFIG);
      }
    });

    it("ConfigService.load throws descriptive error on invalid property type", () => {
      expect(() => {
        ConfigService.load("platformer", PlatformerConfigSchema, { PLAYER_SPEED: "invalid_string" });
      }).toThrow(/Configuration validation failed for game "platformer"/);
    });
  });

  describe("EchoRunnerConfigSchema", () => {
    it("safeParse({}) produces default values matching former flat object and DEFAULT_ECHO_RUNNER_CONFIG", () => {
      const parsed = EchoRunnerConfigSchema.safeParse({});
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.SCREEN_WIDTH).toBe(800);
        expect(parsed.data.SCREEN_HEIGHT).toBe(600);
        expect(parsed.data.TILE_SIZE).toBe(40);
        expect(parsed.data.PLAYER_SPEED).toBe(220);
        expect(parsed.data.PLAYER_ACCEL).toBe(900);
        expect(parsed.data.PLAYER_DECEL).toBe(1300);
        expect(parsed.data.PLAYER_JUMP_VEL).toBe(370);
        expect(parsed.data.RISE_GRAVITY).toBe(850);
        expect(parsed.data.FALL_GRAVITY).toBe(1300);
        expect(parsed.data).toEqual(DEFAULT_ECHO_RUNNER_CONFIG);
      }
    });

    it("ConfigService.load throws descriptive error on invalid property type", () => {
      expect(() => {
        ConfigService.load("echorunner", EchoRunnerConfigSchema, { PLAYER_JUMP_VEL: null });
      }).toThrow(/Configuration validation failed for game "echorunner"/);
    });
  });

  describe("FlappyBirdConfigSchema", () => {
    it("safeParse({}) produces default values matching former flat object and DEFAULT_FLAPPY_BIRD_CONFIG", () => {
      const parsed = FlappyBirdConfigSchema.safeParse({});
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.SCREEN_WIDTH).toBe(400);
        expect(parsed.data.SCREEN_HEIGHT).toBe(600);
        expect(parsed.data.BIRD_X).toBe(100);
        expect(parsed.data.BIRD_START_Y).toBe(300);
        expect(parsed.data.BIRD_RADIUS).toBe(15);
        expect(parsed.data.GRAVITY).toBe(800);
        expect(parsed.data.FLAP_STRENGTH).toBe(-300);
        expect(parsed.data.PIPE_WIDTH).toBe(60);
        expect(parsed.data.PIPE_SPEED).toBe(150);
        expect(parsed.data.GAP_SIZE).toBe(140);
        expect(parsed.data.GROUND_Y).toBe(580);
        expect(parsed.data).toEqual(DEFAULT_FLAPPY_BIRD_CONFIG);
      }
    });

    it("ConfigService.load throws descriptive error on invalid property type", () => {
      expect(() => {
        ConfigService.load("flappybird", FlappyBirdConfigSchema, { BIRD_RADIUS: "huge" });
      }).toThrow(/Configuration validation failed for game "flappybird"/);
    });
  });

  describe("SpaceInvadersConfigSchema", () => {
    it("safeParse({}) produces default values matching former flat object and DEFAULT_SPACE_INVADERS_CONFIG", () => {
      const parsed = SpaceInvadersConfigSchema.safeParse({});
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.SCREEN_WIDTH).toBe(800);
        expect(parsed.data.SCREEN_HEIGHT).toBe(600);
        expect(parsed.data.PLAYER_SPEED).toBe(300);
        expect(parsed.data.PLAYER_INITIAL_LIVES).toBe(3);
        expect(parsed.data.PLAYER_BULLET_SPEED).toBe(500);
        expect(parsed.data.ENEMY_BULLET_SPEED).toBe(250);
        expect(parsed.data.INVADER_ROWS).toBe(5);
        expect(parsed.data.INVADER_COLS).toBe(11);
        expect(parsed.data.SHIELD_COUNT).toBe(4);
        expect(parsed.data).toEqual(DEFAULT_SPACE_INVADERS_CONFIG);
      }
    });

    it("ConfigService.load throws descriptive error on invalid property type", () => {
      expect(() => {
        ConfigService.load("space-invaders", SpaceInvadersConfigSchema, { INVADER_ROWS: "five" });
      }).toThrow(/Configuration validation failed for game "space-invaders"/);
    });
  });

  describe("AsteroidConfigSchema", () => {
    it("safeParse({}) produces default values matching former flat object and DEFAULT_ASTEROID_CONFIG", () => {
      const parsed = AsteroidConfigSchema.safeParse({});
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.SCREEN_WIDTH).toBe(800);
        expect(parsed.data.SCREEN_HEIGHT).toBe(600);
        expect(parsed.data.INITIAL_ASTEROID_COUNT).toBe(5);
        expect(parsed.data.SHIP_THRUST).toBe(150);
        expect(parsed.data.FRICTION).toBe(0.99);
        expect(parsed.data.BULLET_SPEED).toBe(300);
        expect(parsed.data).toEqual(DEFAULT_ASTEROID_CONFIG);
      }
    });

    it("ConfigService.load throws descriptive error on invalid property type", () => {
      expect(() => {
        ConfigService.load("asteroids", AsteroidConfigSchema, { SHIP_THRUST: false });
      }).toThrow(/Configuration validation failed for game "asteroids"/);
    });
  });

  describe("GeometryWarsConfigSchema", () => {
    it("safeParse({}) produces default values matching former flat object and DEFAULT_GEOMETRYWARS_CONFIG", () => {
      const parsed = GeometryWarsConfigSchema.safeParse({});
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.WIDTH).toBe(800);
        expect(parsed.data.HEIGHT).toBe(600);
        expect(parsed.data.PLAYER_SPEED).toBe(220);
        expect(parsed.data.BULLET_SPEED).toBe(500);
        expect(parsed.data.INITIAL_LIVES).toBe(3);
        expect(parsed.data.INITIAL_BOMBS).toBe(3);
        expect(parsed.data).toEqual(DEFAULT_GEOMETRYWARS_CONFIG);
      }
    });

    it("ConfigService.load throws descriptive error on invalid property type", () => {
      expect(() => {
        ConfigService.load("geometrywars", GeometryWarsConfigSchema, { PLAYER_SPEED: [] });
      }).toThrow(/Configuration validation failed for game "geometrywars"/);
    });
  });

  describe("PongConfigSchema", () => {
    it("safeParse({}) produces default values matching former flat object and DEFAULT_PONG_CONFIG", () => {
      const parsed = PongConfigSchema.safeParse({});
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.WIDTH).toBe(800);
        expect(parsed.data.HEIGHT).toBe(600);
        expect(parsed.data.BALL_SIZE).toBe(8);
        expect(parsed.data.BALL_SPEED_START).toBe(300);
        expect(parsed.data.PADDLE_SPEED).toBe(400);
        expect(parsed.data.MAX_SCORE).toBe(5);
        expect(parsed.data).toEqual(DEFAULT_PONG_CONFIG);
      }
    });

    it("ConfigService.load throws descriptive error on invalid property value", () => {
      expect(() => {
        ConfigService.load("pong", PongConfigSchema, { BALL_SIZE: -5 });
      }).toThrow(/Configuration validation failed for game "pong"/);
    });
  });
});
