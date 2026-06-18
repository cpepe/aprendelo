#!/bin/bash
set -e

echo "Setting up web assets..."
mkdir -p ios/WebAssets/static
cp index.html ios/WebAssets/
cp -r static/* ios/WebAssets/static/

echo "Generating Xcode Project..."
xcodegen generate

echo "Done! You can now open AprendeloIOS.xcodeproj"
