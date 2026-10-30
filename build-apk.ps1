# Собирает подписанный APK «Полки» -> Polka.apk рядом с этим файлом.
# Нужны: Java 21 (%USERPROFILE%\.jdks), Android SDK и ключ подписи (путь — в android\local.properties, polka.keystore=...).
# Builds the signed "Polka" APK -> Polka.apk next to this file.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

$env:JAVA_HOME = (Get-ChildItem "$env:USERPROFILE\.jdks" -Directory | Where-Object Name -like 'jdk-21*' | Select-Object -First 1).FullName
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

Set-Location $root
npm run build
if ($LASTEXITCODE) { throw 'Не удалось собрать веб-часть' }
npx cap sync android
if ($LASTEXITCODE) { throw 'Не удалось обновить Android-проект' }

Set-Location "$root\android"
.\gradlew.bat assembleRelease
if ($LASTEXITCODE) { throw 'Не удалось собрать APK' }

Copy-Item "$root\android\app\build\outputs\apk\release\app-release.apk" "$root\Polka.apk" -Force
Write-Host "Готово: $root\Polka.apk"
