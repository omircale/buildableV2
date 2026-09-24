import { supabase } from '../../cloud/supabase';
import type { ArFormat } from './arExport';

/**
 * Puts a 3D model somewhere AR can fetch it, and gives back a link that expires.
 *
 * Quick Look on iPhone and Scene Viewer on Android cannot open a file that lives in the browser —
 * they take a URL and fetch it themselves. So standing a design in the room means the model file
 * leaves the device, which is the first time anything here does for a reason other than the person
 * saving their own project.
 *
 * What that costs is kept as small as it can be: the bucket is private, the object is written under
 * the person's own user id so the storage policies keep everyone out of everyone else's, the link is
 * signed and expires within the hour, and the file is overwritten each time rather than accumulating.
 */

/** How long a signed link stays good. Long enough to walk to the wall, short enough not to linger. */
export const SIGNED_URL_TTL_SECONDS = 3600;

export type HostFailure = 'not-configured' | 'not-signed-in' | 'upload-failed' | 'sign-failed';

export class HostError extends Error {
  readonly reason: HostFailure;
  constructor(reason: HostFailure, message: string) {
    super(message);
    this.reason = reason;
  }
}

const CONTENT_TYPE: Record<ArFormat, string> = {
  usdz: 'model/vnd.usdz+zip',
  glb: 'model/gltf-binary',
};

/**
 * Uploads one model and returns a link AR can open. `designId` keeps a person's own designs apart
 * without ever appearing in someone else's path.
 */
export async function hostModel(blob: Blob, format: ArFormat, designId: string): Promise<string> {
  if (!supabase) throw new HostError('not-configured', 'Cloud storage is not configured.');

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new HostError('not-signed-in', 'Viewing in the room needs you to be signed in.');

  // The folder is the owner's user id, which is what the storage policies check.
  const path = `${uid}/${safeName(designId)}.${format}`;
  const { error: uploadError } = await supabase.storage.from('ar-models').upload(path, blob, {
    contentType: CONTENT_TYPE[format],
    upsert: true,
  });
  if (uploadError) throw new HostError('upload-failed', uploadError.message);

  const { data, error: signError } = await supabase.storage.from('ar-models').createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signError || !data?.signedUrl) throw new HostError('sign-failed', signError?.message ?? 'No link was returned.');
  return data.signedUrl;
}

/** Removes the hosted copy — used when a person is done, so the file does not sit there. */
export async function unhostModel(format: ArFormat, designId: string): Promise<void> {
  if (!supabase) return;
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return;
  await supabase.storage.from('ar-models').remove([`${uid}/${safeName(designId)}.${format}`]);
}

/** Storage keys allow a limited character set; a project id or name should never decide the path shape. */
function safeName(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
  return cleaned || 'design';
}
