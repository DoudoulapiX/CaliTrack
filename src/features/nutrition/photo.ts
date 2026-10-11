/** Côté le plus long de la photo envoyée : assez pour reconnaître une assiette, sans coût inutile. */
export const PHOTO_MAX_SIDE = 1280

/** Les dimensions d'une image réduite pour tenir dans `max` pixels de côté (jamais agrandie). */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** La photo ne s'ouvre pas (format inconnu, fichier abîmé). */
export class UnreadablePhotoError extends Error {
  constructor() {
    super('Cette photo ne s’ouvre pas : choisis-en une autre.')
    this.name = 'UnreadablePhotoError'
  }
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    // Tient compte de l'orientation de l'appareil photo (photo prise en portrait).
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // Certains formats (HEIC sur un vieux Safari) ne passent que par une balise <img>.
    const url = URL.createObjectURL(file)
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      return image
    } catch {
      throw new UnreadablePhotoError()
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : ''
      resolve(url.slice(url.indexOf(',') + 1))
    }
    reader.onerror = () => {
      reject(new UnreadablePhotoError())
    }
    reader.readAsDataURL(blob)
  })
}

/** La photo réduite et recompressée en JPEG, encodée en base64 pour l'API. */
export async function preparePhoto(file: Blob, maxSide: number = PHOTO_MAX_SIDE): Promise<string> {
  const image = await decode(file)
  const natural =
    image instanceof HTMLImageElement
      ? { width: image.naturalWidth, height: image.naturalHeight }
      : { width: image.width, height: image.height }
  if (natural.width === 0 || natural.height === 0) throw new UnreadablePhotoError()
  const size = fitWithin(natural.width, natural.height, maxSide)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) throw new UnreadablePhotoError()
  context.drawImage(image, 0, 0, size.width, size.height)
  if ('close' in image) image.close()
  const jpeg = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.85)
  })
  if (!jpeg) throw new UnreadablePhotoError()
  return toBase64(jpeg)
}
