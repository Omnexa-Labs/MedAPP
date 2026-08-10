// Lets TypeScript understand `import Foo from "....svg"`, which Metro compiles
// into a react-native-svg component via react-native-svg-transformer.
declare module "*.svg" {
  import type * as React from "react";
  import type { SvgProps } from "react-native-svg";

  const content: React.FC<SvgProps>;
  export default content;
}
