// A screenshot from the game (site/capture/), lazy-loaded.

interface Props {
  name: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}

export function Shot({ name, alt, width, height, className = '' }: Props) {
  return <img className={`shot ${className}`} src={`/media/${name}.webp`} alt={alt} width={width} height={height} loading="lazy" decoding="async" />;
}
