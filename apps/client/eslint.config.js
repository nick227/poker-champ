import universe from "eslint-config-universe";

export default [
  ...universe,
  { rules: { "react/react-in-jsx-scope": "off" } }
];
