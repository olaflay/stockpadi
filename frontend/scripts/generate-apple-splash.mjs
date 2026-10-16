import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.resolve(__dirname, "../public");
const iconSvgPath = path.join(publicDir, "icon.svg");

const SIZES = [
  { width: 1170, height: 2532, name: "apple-splash-1170x2532.png", iconSize: 240 },
  { width: 1290, height: 2796, name: "apple-splash-1290x2796.png", iconSize: 260 },
  { width: 1179, height: 2556, name: "apple-splash-1179x2556.png", iconSize: 240 },
  { width: 750, height: 1334, name: "apple-splash-750x1334.png", iconSize: 180 },
  { width: 1170, height: 2532, name: "apple-splash.png", iconSize: 240 }, // universal fallback
];

async function generate() {
  const svgBuffer = fs.readFileSync(iconSvgPath);

  for (const item of SIZES) {
    const resizedIcon = await sharp(svgBuffer)
      .resize(item.iconSize, item.iconSize)
      .toBuffer();

    const outputPath = path.join(publicDir, item.name);

    await sharp({
      create: {
        width: item.width,
        height: item.height,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([
        {
          input: resizedIcon,
          gravity: "center",
        },
      ])
      .png({ compressionLevel: 9 })
      .toFile(outputPath);

    console.log(`Generated ${item.name} (${item.width}x${item.height})`);
  }
}

generate().catch((err) => {
  console.error("Error generating splash images:", err);
  process.exit(1);
});
