# Pubblicazione, log e testing

----------------------------------------------------------------|
PER RELEASE
----------------------------------------------------------------|
Apri `android/app/build.gradle` e incrementa i numeri `versionCode`
(es. da 1 a 2) e `versionName` (es. da "1.0" a "1.1").

```sh
cd android
./gradlew clean
./gradlew assembleRelease
```

----------------------------------------------------------------|
ENJOY THE APK
`demo/android/app/build/outputs/apk/release/app-release.apk`
----------------------------------------------------------------|

--------------------------------|
PER LOG (solo con debug USB)
--------------------------------|
```sh
adb logcat -s ReactNativeJS:V
```
--------------------------------|

------------------------------------------------------------------------|
PER TESTING
------------------------------------------------------------------------|
```sh
npx jest --verbose 2>&1 | grep -E "Tests:|Test Suites:|PASS|FAIL"
```
------------------------------------------------------------------------|
