import { type PublicTarget } from '@/target/types/public-target.type';
import { type ResolvedTarget } from '@/target/types/resolved-target.type';

export const toPublicTarget = ({
  apiUrl,
  source,
}: ResolvedTarget): PublicTarget => ({ apiUrl, source });
