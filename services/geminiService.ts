import { GoogleGenAI, Type } from "@google/genai";
import { Point } from "../types";

const SYSTEM_INSTRUCTION = `
You are an expert computer vision assistant specialized in detecting human poses for OpenPose.
Your task is to analyze the provided image and detect the 2D coordinates for the standard 18 COCO keypoints.
Return a JSON object with a single property 'keypoints'.
'keypoints' must be an array of objects, each containing 'name' (string), 'x' (integer), and 'y' (integer).
The coordinates should be absolute pixel values based on the image resolution. 
If a keypoint is not visible, infer its most likely position or return coordinates 0,0.
The order of keypoints MUST be exactly:
Nose, Neck, R_Shoulder, R_Elbow, R_Wrist, L_Shoulder, L_Elbow, L_Wrist, R_Hip, R_Knee, R_Ankle, L_Hip, L_Knee, L_Ankle, R_Eye, L_Eye, R_Ear, L_Ear.
`;

export const detectPose = async (
  imageBase64: string, 
  width: number, 
  height: number
): Promise<{ x: number; y: number }[] | null> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      console.warn("Gemini API Key is missing");
      return null;
    }

    const ai = new GoogleGenAI({ apiKey });
    
    // Using Pro model for better spatial reasoning
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: imageBase64.split(',')[1] // remove data:image/jpeg;base64,
            }
          },
          {
            text: `Detect the 18 COCO OpenPose keypoints. The image dimensions are ${width}x${height}. Return JSON.`
          }
        ]
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            keypoints: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER }
                }
              }
            }
          }
        }
      }
    });

    const text = response.text;
    if (!text) return null;

    const data = JSON.parse(text);
    if (!data.keypoints || !Array.isArray(data.keypoints)) return null;

    // Map to simple point array
    return data.keypoints.map((kp: any) => ({
      x: kp.x,
      y: kp.y
    }));

  } catch (error) {
    console.error("Gemini pose detection failed:", error);
    return null;
  }
};
