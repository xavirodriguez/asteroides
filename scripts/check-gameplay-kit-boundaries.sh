#!/bin/bash

# check-gameplay-kit-boundaries.sh
# Ensures that @tiny-aster/gameplay-kit does not import forbidden platform-specific or game-specific modules.

KIT_PATH="packages/gameplay-kit/src"
EXIT_CODE=0

echo "🔍 Checking @tiny-aster/gameplay-kit boundaries..."

# 1. Prohibit React Native / Expo / Colyseus imports
FORBIDDEN_PLATFORM=("react-native" "expo-" "@shopify/react-native-skia" "@colyseus")

for pkg in "${FORBIDDEN_PLATFORM[@]}"; do
    if grep -r "$pkg" "$KIT_PATH" --exclude-dir=__tests__ > /dev/null; then
        echo "❌ ERROR: Forbidden platform import found: '$pkg' in $KIT_PATH"
        grep -r "$pkg" "$KIT_PATH" --exclude-dir=__tests__
        EXIT_CODE=1
    fi
done

# 2. Prohibit imports from src/games or src/app (game-specific logic)
FORBIDDEN_DOMAIN=("src/games" "src/app")

for domain in "${FORBIDDEN_DOMAIN[@]}"; do
    if grep -r "$domain" "$KIT_PATH" > /dev/null; then
        echo "❌ ERROR: Gameplay Kit should not depend on game-specific logic: '$domain' found in $KIT_PATH"
        grep -r "$domain" "$KIT_PATH"
        EXIT_CODE=1
    fi
done

# 3. Prohibit absolute imports or alias to 'src/'
if grep -r "@/src" "$KIT_PATH" > /dev/null; then
    echo "❌ ERROR: Prohibited absolute import '@/' found in $KIT_PATH"
    grep -r "@/src" "$KIT_PATH"
    EXIT_CODE=1
fi

if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Boundaries check passed! @tiny-aster/gameplay-kit is clean."
else
    echo "❌ Boundaries check failed."
fi

exit $EXIT_CODE
