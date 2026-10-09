#!/bin/bash
set -e

echo "Generating Xcode Project..."
xcodegen generate

echo "Done! You can now open AprendeloIOS.xcodeproj"
