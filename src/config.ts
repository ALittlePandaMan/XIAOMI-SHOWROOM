export const paints = [
  {id:'teal',name:'远山青',color:[.04,.085,.105],swatch:'#5c818b',image:'/images/official/paint-teal.png',metalness:.78},
  {id:'blue',name:'蝴蝶谷蓝',color:[.01,.08,.205],swatch:'#087faf',image:'/images/official/paint-blue.png',metalness:.8},
  {id:'graphite',name:'火山灰',color:[.026,.035,.043],swatch:'#51565d',image:'/images/official/paint-graphite.png',metalness:.78},
  {id:'khaki',name:'冷卡其',color:[.43,.405,.345],swatch:'#b7b4a1',image:'/images/official/paint-khaki.png',metalness:.32},
  {id:'black',name:'曜石黑',color:[.012,.014,.02],swatch:'#24262c',image:'/images/official/paint-black.png',metalness:.78},
  {id:'white',name:'珍珠白',color:[.8,.8,.78],swatch:'#ededeb',image:'/images/official/paint-white.png',metalness:.32},
  {id:'wine',name:'酒红',color:[.09,.008,.025],swatch:'#562135',image:'/images/official/paint-wine.png',metalness:.78},
] as const;
export const wheels=[{id:3,name:'21寸光辐轮毂',image:'/images/official/wheel-3.png'},{id:1,name:'21寸棱镜轮毂',image:'/images/official/wheel-1.png'},{id:2,name:'21寸星芒轮毂',image:'/images/official/wheel-2.png'}] as const;
export type PaintId=typeof paints[number]['id'];
export type WheelId=typeof wheels[number]['id'];
export type Trim='brushed'|'body';
export const interiors=[{id:'sand',name:'砂陶米',image:'/images/official/interior-sand.png'},{id:'mocha',name:'摩卡棕',image:'/images/official/interior-mocha.png'},{id:'black',name:'暗夜黑',image:'/images/n70/interior-black.svg'}] as const;
export type InteriorId=typeof interiors[number]['id'];
export interface Configuration {paint:PaintId;wheel:WheelId;trim:Trim;interior:InteriorId;doors:boolean;roof:boolean;projector:boolean;dimensions:boolean;lights:boolean;autoRotate:boolean}
export const defaults:Configuration={paint:'teal',wheel:3,trim:'brushed',interior:'mocha',doors:false,roof:false,projector:false,dimensions:false,lights:true,autoRotate:false};
export const officialUrl='https://show.xiaomiev.com/v2/showroom?itemId=510036425189&ssuId=610085836993&source=pcn90maxstudiohomepage';
