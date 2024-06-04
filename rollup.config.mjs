import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import { dts } from 'rollup-plugin-dts';
const input = 'src/index.ts';
const name = 'wingUniBle';
export default [
  {
    input,
    output: [{ file: `dist/index.d.ts`, format: 'es' }],
    plugins: [dts()],
  },
  {
    input,
    output: [
      { file: `dist/index.amd.js`, format: 'amd' },
      { file: `dist/index.cjs.js`, format: 'cjs' },
      { file: `dist/index.esm.js`, format: 'es' },
      { file: `dist/index.js`, format: 'es' },
      { file: `dist/index.iife.js`, format: 'iife', name },
      { file: `dist/index.umd.js`, format: 'umd', name },
      { file: `dist/index.system.js`, format: 'system' },
    ],
    plugins: [terser(), typescript()],
  },
];
