import "react";

// Lets inline styles set CSS custom properties, such as a table's column widths, without a cast.
declare module "react" {
  interface CSSProperties {
    [property: `--${string}`]: string | number | undefined;
  }
}
