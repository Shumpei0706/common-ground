import {copy as en} from './gather-cards-copy.en.js';
import {copy as ja} from './gather-cards-copy.js';
import {featureLabels as featureEn} from './qloo-feature-labels.en.js';
import {featureLabels as featureJa} from './qloo-feature-labels.js';
const valid=language=>language==='ja'?'ja':'en';
export function readLanguage(storage){try{return valid((storage===undefined?globalThis.localStorage:storage)?.getItem('cg-language'));}catch{return 'en';}}
export function writeLanguage(language,storage){const next=valid(language);try{(storage===undefined?globalThis.localStorage:storage)?.setItem('cg-language',next);}catch{}return next;}
export const copyFor=language=>language==='ja'?ja:en;
export function featureText(tag,language){if(!tag)return '';const labels=language==='ja'?featureJa:featureEn;return labels[tag.original]||(language==='ja'?tag.label||tag.original:tag.original||tag.label)||'';}
