LIMS 2.0 - Electron icon and branding pack

Verified contents
- build/icon.ico: Windows multi-size icon containing 16, 24, 32, 48, 64, 128 and 256 px images
- build/icon.png: 1024 x 1024 master PNG
- src/assets/branding/lims-mark.svg: scalable app mark
- src/assets/branding/lims-mark.png: transparent 1024 x 1024 mark
- src/assets/branding/lims-full.svg: full LIMS logo
- src/assets/branding/lims-full.png: transparent full logo
- icons/: individual PNG sizes

Electron Builder example

"build": {
  "productName": "LIMS 2.0",
  "win": {
    "icon": "build/icon.ico"
  }
}

BrowserWindow example

new BrowserWindow({
  icon: path.join(__dirname, '../build/icon.ico')
});

Copy the build and src folders into the LIMS project root, preserving paths.
