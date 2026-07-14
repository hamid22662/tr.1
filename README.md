# TradeLog — Offline Forex & Crypto Journal

A React Native / Expo local-first trading journal for Android and iOS.

## Run locally

```bash
npm install
npx expo install --fix --npm
npx expo start --go
```

Then scan the QR code using Expo Go on Android.

## Upgrade from the first test build

1. Stop Expo in the terminal with `Ctrl + C`.
2. Extract the updated project ZIP into a new folder.
3. Run the commands above inside the new `tradelog` folder.
4. Run `npx expo start -c --go` to clear Expo’s cache.

The app database uses the same file name (`tradelog.db`). Existing journal data remains available when the same Expo Go project/app environment is used. Existing closed trades are recalculated when the updated app starts.

## Important calculation assumption

The default account currency is USD. The included default symbols contain their pip/point size and contract size. For USDJPY the entry price is used to convert the pip value to USD. Cross pairs and broker-specific CFDs may require custom symbol configuration in a later version.

See `UPDATE_V2_1.md` for calculation examples and what changed in this version.
