// Публикуем только файлы приложения и используемые модули Three.js.
export const siteFiles = [
  ['index.html', 'index.html'],
  ['styles.css', 'styles.css'],
  ['app.js', 'app.js'],
  ['landscape.js', 'landscape.js'],
  ['review.js', 'review.js'],
  ['review-data.js', 'review-data.js'],
  ['model.js', 'model.js'],
  ['roof-variant.js', 'roof-variant.js'],
  ['driving.js', 'driving.js'],
  ['interior.js', 'interior.js'],
  ['vendor/three/three.module.js', 'node_modules/three/build/three.module.js'],
  ['vendor/three/three.core.js', 'node_modules/three/build/three.core.js'],
  ['vendor/three/addons/controls/OrbitControls.js', 'node_modules/three/examples/jsm/controls/OrbitControls.js'],
  ['vendor/three/addons/environments/RoomEnvironment.js', 'node_modules/three/examples/jsm/environments/RoomEnvironment.js'],
  ['vendor/three/addons/geometries/RoundedBoxGeometry.js', 'node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js'],
  ...[
    'postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js', 'postprocessing/SSAOPass.js', 'postprocessing/OutputPass.js',
    'postprocessing/Pass.js', 'postprocessing/ShaderPass.js', 'postprocessing/MaskPass.js',
    'shaders/CopyShader.js', 'shaders/SSAOShader.js', 'shaders/OutputShader.js', 'math/SimplexNoise.js',
  ].map(path => [`vendor/three/addons/${path}`, `node_modules/three/examples/jsm/${path}`]),
  ['vendor/three/LICENSE', 'node_modules/three/LICENSE'],
];
