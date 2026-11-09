#!/usr/bin/env python3
"""Apply Tauri's documented Android release-signing setup to generated Gradle files."""
from pathlib import Path
import re
import sys

gradle = Path("src-tauri/gen/android/app/build.gradle.kts")
if not gradle.is_file():
    raise SystemExit(f"Android Gradle project not found: {gradle}")

source = gradle.read_text(encoding="utf-8")
imports = []
if "import java.io.FileInputStream" not in source:
    imports.append("import java.io.FileInputStream")
if "import java.util.Properties" not in source:
    imports.append("import java.util.Properties")
if imports:
    source = "\n".join(imports) + "\n" + source

signing_block = r'''
signingConfigs {
    create("release") {
        val keystorePropertiesFile = rootProject.file("keystore.properties")
        require(keystorePropertiesFile.exists()) {
            "CORNHILL Android release keystore.properties is missing."
        }
        val keystoreProperties = Properties()
        keystoreProperties.load(FileInputStream(keystorePropertiesFile))
        keyAlias = keystoreProperties["keyAlias"] as String
        keyPassword = keystoreProperties["password"] as String
        storeFile = file(keystoreProperties["storeFile"] as String)
        storePassword = keystoreProperties["password"] as String
    }
}
'''
if 'create("release")' not in source:
    match = re.search(r"(?m)^\s*buildTypes\s*\{", source)
    if not match:
        raise SystemExit("Could not safely locate the Android app buildTypes block.")
    source = source[:match.start()] + signing_block + "\n" + source[match.start():]

release_match = re.search(r'(?m)^(\s*)(?:getByName\("release"\)|maybeCreate\("release"\)|release)\s*\{', source)
if not release_match:
    raise SystemExit("Could not safely locate the Android release build type.")
indent = release_match.group(1) + "    "
insert_at = release_match.end()
tail = source[insert_at:]
if "signingConfig = signingConfigs.getByName(\"release\")" not in tail[:1200]:
    source = source[:insert_at] + "\n" + indent + 'signingConfig = signingConfigs.getByName("release")' + source[insert_at:]

gradle.write_text(source, encoding="utf-8")
print("Configured the Android release build to use the private CORNHILL keystore.")
