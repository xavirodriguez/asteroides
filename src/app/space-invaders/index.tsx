import { useState, useEffect, useCallback, FC } from "react";
import { StyleSheet, View, Text, TouchableOpacity, Platform } from "react-native";
import { PlayerProfileService } from "../../services/PlayerProfileService";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CanvasRenderer } from "@/components/CanvasRenderer";
import { ComboDisplay } from "@/components/ComboDisplay";
import { SpaceInvadersUI } from "@/components/SpaceInvadersUI";
import { VirtualJoystick } from "../../components/controls/VirtualJoystick";
import { ShootButton } from "../../components/ShootButton";
import { DebugOverlay } from "@/components/debug/DebugOverlay";
import { useSpaceInvadersGame } from "@/hooks/useSpaceInvadersGame";
import { useMultiplayerGame } from "@/hooks/useMultiplayerGame";
import { SeedWidget } from "@/components/SeedWidget";
import { DailyChallengeBanner } from "@/components/DailyChallengeBanner";
import { DailyResultsOverlay } from "@/components/DailyResultsOverlay";
import { MutatorService } from "@/services/MutatorService";
import { MutatorBadge } from "@/components/MutatorBadge";
import { Mutator } from "@/config/MutatorConfig";
import { SpaceInvadersGame, InputState } from "@/games/space-invaders";
import { GameErrorBoundary } from "@/components/GameErrorBoundary";
import { MULTIPLAYER_CONFIG } from "@/config/MultiplayerConfig";
import { useGameSession } from "@/hooks/useGameSession";
import { useKeyboardControls } from "../../hooks/useKeyboardControls";
import { RadialBackground } from "@/components/RadialBackground";
import { sharedScreenStyles } from "@/styles/SharedGameScreenStyles";
import { AttractModeController } from "@tiny-aster/gameplay-kit";
import { useTranslation } from "@/hooks/useTranslation";
import { hapticSelection } from "@/utils/haptics";
import { colors, neonTextGlow } from "../../theme";
import {
  GameScreen,
  GameTitle,
  GameInstructions,
  PlayerNameInput,
  HighScoreText,
  BackButton,
  NeonButton,
} from "../../components/ui";

export default function SpaceInvadersScreen() {
  const { t } = useTranslation();
  const [isAttractMode, setIsAttractMode] = useState(false);
  const [idleTime, setIdleTime] = useState(0);
  const [playerName, setPlayerName] = useState("");
  const [initialSeed, setInitialSeed] = useState<number | undefined>();

  // Sync player name from profile
  useEffect(() => {
    PlayerProfileService.getProfile().then((p) => {
      setPlayerName(p.displayName);
    });
  }, []);

  const handlePlayerNameChange = (name: string) => {
    setPlayerName(name);
    PlayerProfileService.updateDisplayName(name);
  };
  const [started, setStarted] = useState(false);
  const [isMulti, setIsMulti] = useState(false);
  const [isDaily, setIsDaily] = useState(false);
  const { game, gameState, handleInput, isPaused, isReady, togglePause, highScore, seed, restartWithSeed } = useSpaceInvadersGame(started, isMulti && started, initialSeed);

  const [activeMutators, setActiveMutators] = useState<Mutator[]>([]);

  // 1. Idle Activity tracking for Attract Mode
  useEffect(() => {
    if (started) {
      setIdleTime(0);
      return;
    }

    const timer = setInterval(() => {
      setIdleTime((prev) => {
        if (prev >= 9) {
          clearInterval(timer);
          setIsAttractMode(true);
          setStarted(true);
          return 0;
        }
        return prev + 1;
      });
    }, 1000);

    const resetIdle = () => setIdleTime(0);

    if (Platform.OS === "web") {
      window.addEventListener("mousemove", resetIdle);
      window.addEventListener("keydown", resetIdle);
    }

    return () => {
      clearInterval(timer);
      if (Platform.OS === "web") {
        window.removeEventListener("mousemove", resetIdle);
        window.removeEventListener("keydown", resetIdle);
      }
    };
  }, [started]);

  // 2. Drive game via AttractModeController during Attract Mode
  useEffect(() => {
    if (isAttractMode && game) {
      const controller = new AttractModeController(game);
      controller.start();

      const unsubscribe = game.getGameLoop().subscribeUpdate((dt) => {
        controller.update(dt);
      });

      return () => {
        unsubscribe();
        controller.stop();
      };
    }
  }, [isAttractMode, game]);

  const { room, connected, handleMultiplayerInput: sendNetInput } = useMultiplayerGame<SpaceInvadersGame, InputState>({
    game,
    roomName: "space-invaders",
    playerName,
    active: isMulti && started,
  });

  useEffect(() => {
    MutatorService.isMutatorModeEnabled().then(enabled => {
      if (enabled) {
        setActiveMutators(MutatorService.getActiveMutatorsForGame("space-invaders"));
      }
    });
  }, []);

  const { showDailyResults, setShowDailyResults } = useGameSession({
    gameId: "space-invaders",
    isDaily,
    seed,
    gameState: gameState ?? { isGameOver: false },
  });

  const handleMultiplayerInput = useCallback((input: Partial<InputState>) => {
    if (isMulti && room) {
      sendNetInput(input);
    } else {
      handleInput(input);
      game?.setInputState(input);
    }
  }, [isMulti, room, sendNetInput, handleInput, game]);

  // Activate keyboard controls for Web
  useKeyboardControls(game, isReady, handleMultiplayerInput);

  const handleShootPress = useCallback(() => {
    handleMultiplayerInput({ shoot: true });
  }, [handleMultiplayerInput]);

  const handleShootRelease = useCallback(() => {
    handleMultiplayerInput({ shoot: false });
  }, [handleMultiplayerInput]);

  if (!started) {
    return (
      <StartScreen
        title="SPACE INVADERS"
        highScore={highScore}
        onStart={() => {
          hapticSelection();
          setIsMulti(false);
          setStarted(true);
        }}
        onStartMulti={() => {
          hapticSelection();
          setIsMulti(true);
          setStarted(true);
        }}
        playerName={playerName}
        onPlayerNameChange={handlePlayerNameChange}
        instructions={Platform.OS === "web" ? t["space-invaders"].instructions : t.common.touch_controls}
        onSeedChange={setInitialSeed}
        onStartDaily={(dailySeed) => {
          hapticSelection();
          setInitialSeed(dailySeed);
          setIsDaily(true);
          setIsMulti(false);
          setStarted(true);
        }}
        activeMutators={activeMutators}
      />
    );
  }

  if (!game || !isReady) return null;

  return (
    <GameErrorBoundary gameId="space-invaders">
    <SafeAreaProvider>
      <View style={sharedScreenStyles.container}>
        <RadialBackground />

        {isAttractMode && (
          <TouchableOpacity
            style={styles.attractOverlay}
            activeOpacity={1}
            onPress={() => {
              setIsAttractMode(false);
              setStarted(false);
            }}
          >
            <Text style={styles.attractTitle}>DEMO MODE</Text>
            <Text style={styles.attractSubtitle}>TAP ANYWHERE TO PLAY</Text>
          </TouchableOpacity>
        )}
        <BackButton label={t.common.menu} />

        {isMulti && !connected && (
            <View style={sharedScreenStyles.overlay}>
                <Text style={sharedScreenStyles.overlayText}>{t.common.connecting}</Text>
            </View>
        )}

        <ComboDisplay multiplier={gameState?.multiplier || 1} isActive={true} />
        <SpaceInvadersUI
          gameState={gameState}
          onRestart={() => isMulti ? room?.send("start_game") : game.restart()}
          onPause={() => togglePause()}
          isPaused={isPaused}
          highScore={highScore}
          seed={seed}
          onSetSeed={restartWithSeed}
          onContinue={() => {
            game.getEventBus().emit("player:continue", {});
          }}
        />
        <CanvasRenderer
          world={() => game.getWorld()}
          gameLoop={game.getGameLoop()}
          onInitialize={(renderer) => game.initializeRenderer(renderer)}
        />

        <View style={styles.controls} pointerEvents="box-none">
          <View style={{ flex: 1, height: '100%' }} pointerEvents="box-none">
            <VirtualJoystick
              joystickId="movement_joystick"
              type="movement"
              onMove={(x, y) => {
                const moveLeft = x < -0.25;
                const moveRight = x > 0.25;
                handleMultiplayerInput({
                  moveLeft,
                  moveRight,
                });
              }}
              onRelease={() => {
                handleMultiplayerInput({
                  moveLeft: false,
                  moveRight: false,
                });
              }}
            />
          </View>
          <ShootButton
            onPressIn={handleShootPress}
            onPressOut={handleShootRelease}
          />
        </View>

        <DebugOverlay game={game} room={room} />

        {showDailyResults && seed !== undefined && (
          <View style={sharedScreenStyles.overlay}>
            <DailyResultsOverlay
              gameId="space-invaders"
              score={gameState.score}
              seed={seed}
              onClose={() => setShowDailyResults(false)}
            />
          </View>
        )}
      </View>
    </SafeAreaProvider>
    </GameErrorBoundary>
  );
}

const StartScreen: FC<{
  title: string;
  highScore: number;
  onStart: () => void;
  onStartMulti: () => void;
  playerName: string;
  onPlayerNameChange: (name: string) => void;
  instructions: string;
  onSeedChange?: (seed: number) => void;
  onStartDaily?: (seed: number) => void;
  activeMutators?: Mutator[];
}> = ({
  title,
  highScore,
  onStart,
  onStartMulti,
  playerName,
  onPlayerNameChange,
  instructions,
  onSeedChange,
  onStartDaily,
  activeMutators = [],
}) => {
  const { t } = useTranslation();
  return (
    <GameScreen>
      <BackButton label={t.common.menu} />
      <GameTitle glowColor={colors.cyan}>{title}</GameTitle>

      <PlayerNameInput
        label={t.accessibility.player_name_label}
        value={playerName}
        onChangeText={onPlayerNameChange}
        placeholder={t.common.your_name}
      />

      <GameInstructions>{instructions}</GameInstructions>
      <HighScoreText label={t.common.record} score={highScore} />

      {onStartDaily && <DailyChallengeBanner gameId="space-invaders" onPlay={onStartDaily} />}

      <MutatorBadge mutators={activeMutators} />

      {onSeedChange && (
        <SeedWidget
          seed={0}
          onSeedEnter={onSeedChange}
          style={styles.seedWidget}
        />
      )}

      <View style={sharedScreenStyles.buttonRow}>
          <NeonButton
            variant="white"
            onPress={() => {
              hapticSelection();
              onStart();
            }}
            accessibilityLabel={t.common.solo}
            accessibilityHint="Inicia una partida individual de Space Invaders"
          >
              {t.common.solo}
          </NeonButton>

          {MULTIPLAYER_CONFIG.STATE !== 'hidden' && (
              <>
                  <View style={styles.spacerHorizontal20} />
                  <NeonButton
                    variant="cyan"
                    onPress={() => {
                      hapticSelection();
                      onStartMulti();
                    }}
                    accessibilityLabel={t.common.multi}
                    accessibilityHint="Inicia una sesión multijugador en línea"
                  >
                      {t.common.multi}
                  </NeonButton>
              </>
          )}
      </View>
    </GameScreen>
  );
};

const styles = StyleSheet.create({
  controls: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 40,
    paddingBottom: 40,
  },
  attractOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    zIndex: 2000,
  },
  attractTitle: {
    color: colors.cyan,
    fontSize: 54,
    fontWeight: "bold",
    fontFamily: "monospace",
    ...neonTextGlow(colors.cyan, 15),
  },
  attractSubtitle: {
    color: colors.white,
    fontSize: 20,
    fontFamily: "monospace",
    marginTop: 20,
    letterSpacing: 2,
  },
  seedWidget: {
    marginBottom: 30,
  },
  spacerHorizontal20: {
    width: 20,
  },
});
