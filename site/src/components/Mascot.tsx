// The game's own tardi (src/ui/mascot.ts), in any team colour and hat.

import { mascotSvg } from '../../../src/ui/mascot';

interface Props {
  color?: number;
  hat?: string;
  className?: string;
  label?: string;
}

export function Mascot({ color, hat, className = '', label = 'A tardigrade' }: Props) {
  // The SVG comes from our own code, never from user input.
  return <span className={`mascot ${className}`} role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: mascotSvg(color, hat) }} />;
}
