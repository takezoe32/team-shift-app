export const cameraConstraints = (deviceId = '') => ({
  audio: false,
  video: {
    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
});

export async function enableContinuousFocus(track) {
  try {
    const capabilities = track?.getCapabilities?.();
    if (capabilities?.focusMode?.includes('continuous')) {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
    }
  } catch {
    // Unsupported camera controls must not prevent scanning.
  }
}
