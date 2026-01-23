// Generate placeholder artwork data with front and back images
// ROAR Brand / African-inspired color palette
const colors = [
  '#CA6702', '#A23E48', '#606C38', '#BC6C25', '#8B4513', // Earth tones
  '#2D5016', '#D2691E', '#CD853F', '#A0522D', '#8B7355', // Browns & tans
  '#B8860B', '#9B870C', '#8B6914', '#6B4423', '#654321', // Golds & browns
  '#8B4513', '#A0522D', '#CD853F', '#D2691E', '#BC6C25', // Terracotta range
  '#CA6702', '#A23E48', '#606C38', '#2D5016', '#8B4513', // Repeat for variety
  '#BC6C25', '#D2691E', '#CD853F', '#A0522D', '#8B7355',
  '#B8860B', '#9B870C', '#8B6914', '#6B4423', '#654321',
  '#CA6702', '#A23E48', '#606C38', '#2D5016', '#8B4513',
];

// Helper function to draw geometric patterns (tribal/African-inspired)
const drawGeometricPattern = (ctx: CanvasRenderingContext2D, width: number, height: number, color: string) => {
  const patternColors = [color, '#FDF5E6', '#8B4513'];
  const step = 20;
  
  // Draw geometric triangles and lines
  for (let y = 0; y < height; y += step * 2) {
    for (let x = 0; x < width; x += step * 2) {
      ctx.fillStyle = patternColors[(x + y) % patternColors.length];
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + step, y);
      ctx.lineTo(x + step / 2, y + step);
      ctx.closePath();
      ctx.fill();
    }
  }
  
  // Add border pattern
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, width - 20, height - 20);
  
  // Add diagonal lines
  ctx.strokeStyle = '#FDF5E6';
  ctx.lineWidth = 1;
  for (let i = 0; i < width; i += 30) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 20, height);
    ctx.stroke();
  }
};

// Helper function to generate a data URL for a colored image
// This will be called when the component mounts (browser context)
export const generateImageDataUrl = (color: string, text: string, isBack = false): string | null => {
  if (typeof document === 'undefined') {
    // Fallback for SSR or if document is not available
    return null;
  }
  
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) return null;
  
  if (isBack) {
    // Back side: Geometric pattern with texture
    ctx.fillStyle = '#FDF5E6'; // Warm cream background
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw geometric pattern
    drawGeometricPattern(ctx, canvas.width, canvas.height, color);
    
    // Add text overlay
    ctx.fillStyle = color;
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.toUpperCase(), canvas.width / 2, canvas.height / 2);
    
    // Add decorative border
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(15, 15, canvas.width - 30, canvas.height - 30);
  } else {
    // Front side: Clean design with artwork
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add subtle texture
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    for (let i = 0; i < canvas.width; i += 4) {
      for (let j = 0; j < canvas.height; j += 4) {
        if ((i + j) % 8 === 0) {
          ctx.fillRect(i, j, 2, 2);
        }
      }
    }
    
    // Add text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.toUpperCase(), canvas.width / 2, canvas.height / 2);
    
    // Add decorative accent
    ctx.strokeStyle = '#FDF5E6';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
  }
  
  return canvas.toDataURL();
};

export interface Artwork {
  id: number;
  color: string;
  title: string;
  artist: string;
  frontImage: string;
  imageColor: string;
  imageText: string;
  backImage?: string;
}

// Create 40 artworks to match the 40 images
export const artworks: Artwork[] = Array.from({ length: 40 }, (_, index) => {
  const artworkNum = index + 1;
  const color = colors[index % colors.length]; // Cycle through colors
  
  return {
    id: artworkNum,
    color,
    title: `Artwork ${artworkNum}`,
    artist: `Artist ${(index % 20) + 1}`,
    // Use actual image paths from public/artworks folder
    frontImage: `/artworks/${artworkNum}.jpg`,
    // Back image will use geometric pattern (generated)
    imageColor: color,
    imageText: `Art ${artworkNum}`,
  };
});

export default artworks;
