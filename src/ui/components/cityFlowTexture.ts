import * as THREE from 'three';

// One shared, module-level "flow" texture — a repeating brightness pulse along the U axis
// (TubeGeometry's own along-length coordinate — see three.js's TubeGeometry.generateUVs), used as
// both `map` and `emissiveMap` on every stream tube so one animated offset (see CityGround's own
// useFrame) makes every stream's base color/glow pulse and travel along its own length, reading as
// flowing water instead of a static painted tube. Shared across every consumer (water/valley
// streams, the cash runway) rather than one texture per consumer — much cheaper, and the
// synchronized pulse across the whole city reads as coherent rather than each flow running to its
// own independent clock. Lives in its own file (not CityGround.tsx, which originally defined it)
// purely so this stays a plain function export — a component file mixing component and non-
// component exports breaks React Fast Refresh, which oxlint's react(only-export-components) flags.
let sharedFlowTexture: THREE.CanvasTexture | null = null;
export function getFlowTexture(): THREE.CanvasTexture {
  if (sharedFlowTexture) return sharedFlowTexture;
  const w = 128;
  const h = 16;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, '#3a3a3a');
  grad.addColorStop(0.1, '#ffffff');
  grad.addColorStop(0.26, '#3a3a3a');
  grad.addColorStop(0.6, '#3a3a3a');
  grad.addColorStop(0.72, '#ffffff');
  grad.addColorStop(0.88, '#3a3a3a');
  grad.addColorStop(1, '#3a3a3a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 1);
  sharedFlowTexture = texture;
  return texture;
}
