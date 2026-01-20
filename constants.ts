import { Keypoint, Connection } from './types';

// Standard COCO 18 format used by ControlNet
export const KEYPOINT_NAMES = [
  "Nose", "Neck", "R_Shoulder", "R_Elbow", "R_Wrist", 
  "L_Shoulder", "L_Elbow", "L_Wrist", "R_Hip", "R_Knee", 
  "R_Ankle", "L_Hip", "L_Knee", "L_Ankle", "R_Eye", 
  "L_Eye", "R_Ear", "L_Ear"
];

// Colors for joints (OpenPose standard)
export const JOINT_COLORS_RGB: [number, number, number][] = [
  [255, 0, 0], [255, 85, 0], [255, 170, 0], [255, 255, 0], [170, 255, 0],
  [85, 255, 0], [0, 255, 0], [0, 255, 85], [0, 255, 170], [0, 255, 255],
  [0, 170, 255], [0, 85, 255], [0, 0, 255], [85, 0, 255], [170, 0, 255],
  [255, 0, 255], [255, 0, 170], [255, 0, 85]
];

// Connections between joints (indices based on KEYPOINT_NAMES)
// [start_index, end_index]
export const LIMB_PAIRS = [
  [1, 2], [1, 5], [2, 3], [3, 4], [5, 6], [6, 7], // Arms
  [1, 8], [8, 9], [9, 10], [1, 11], [11, 12], [12, 13], // Legs
  [1, 0], [0, 14], [14, 16], [0, 15], [15, 17] // Face
];

// Colors for limbs (standard OpenPose map)
export const LIMB_COLORS_RGB: [number, number, number][] = [
  [255, 85, 0], [0, 255, 0], [255, 170, 0], [255, 255, 0], [85, 255, 0], [0, 255, 85],
  [0, 255, 170], [0, 255, 255], [0, 170, 255], [0, 85, 255], [0, 0, 255], [85, 0, 255],
  [170, 0, 255], [255, 0, 255], [255, 0, 170], [255, 0, 85], [255, 255, 0] // 17 connections, wait, need to match length
];
// Note: Usually the limb color corresponds to specific limbs. I'll map them 1:1 for the array above.

export const rgbToHex = (r: number, g: number, b: number) => 
  "#" + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join("");

export const INITIAL_KEYPOINTS: Keypoint[] = KEYPOINT_NAMES.map((name, i) => ({
  id: i,
  name,
  x: 0,
  y: 0,
  visible: true,
  locked: false,
  color: rgbToHex(...JOINT_COLORS_RGB[i]),
  rgb: JOINT_COLORS_RGB[i]
}));

export const CONNECTIONS: Connection[] = LIMB_PAIRS.map((pair, i) => {
  // Cycle colors if we don't have enough
  const rgb = LIMB_COLORS_RGB[i % LIMB_COLORS_RGB.length];
  return {
    p1: pair[0],
    p2: pair[1],
    color: rgbToHex(...rgb),
    rgb: rgb
  };
});

// Parent -> Children hierarchy for cascading visibility
export const POSE_HIERARCHY: Record<number, number[]> = {
  1: [0, 2, 5, 8, 11], // Neck -> Nose, Shoulders, Hips
  0: [14, 15], // Nose -> Eyes
  2: [3], // R_Shoulder -> R_Elbow
  3: [4], // R_Elbow -> R_Wrist
  5: [6], // L_Shoulder -> L_Elbow
  6: [7], // L_Elbow -> L_Wrist
  8: [9], // R_Hip -> R_Knee
  9: [10], // R_Knee -> R_Ankle
  11: [12], // L_Hip -> L_Knee
  12: [13], // L_Knee -> L_Ankle
  14: [16], // R_Eye -> R_Ear
  15: [17]  // L_Eye -> L_Ear
};

// Default standing pose (normalized 0-1 coords approximately)
export const DEFAULT_POSE_COORDS = [
  { x: 256, y: 55 },  // Nose
  { x: 256, y: 115 }, // Neck
  { x: 206, y: 115 }, // R_Shoulder
  { x: 186, y: 195 }, // R_Elbow
  { x: 166, y: 255 }, // R_Wrist
  { x: 306, y: 115 }, // L_Shoulder
  { x: 326, y: 195 }, // L_Elbow
  { x: 346, y: 255 }, // L_Wrist
  { x: 226, y: 255 }, // R_Hip
  { x: 226, y: 355 }, // R_Knee
  { x: 226, y: 455 }, // R_Ankle
  { x: 286, y: 255 }, // L_Hip
  { x: 286, y: 355 }, // L_Knee
  { x: 286, y: 455 }, // L_Ankle
  { x: 246, y: 45 },  // R_Eye
  { x: 266, y: 45 },  // L_Eye
  { x: 226, y: 50 },  // R_Ear
  { x: 286, y: 50 },  // L_Ear
];