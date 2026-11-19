// 調整用定数はここに集約します。
// 品質：decor＝装飾の密度(0〜1)、particles＝花びら・綿毛それぞれの数、stars＝星の数、shadows＝影、post＝ポストエフェクトを使うか
export const QUALITY_LEVELS = {
  high: { label: '高', dprMax: 2, shadows: true, shadowMapSize: 1024, decor: 1.0, particles: 160, stars: 800, farHills: true, post: true },
  mid: { label: '中', dprMax: 1.5, shadows: true, shadowMapSize: 512, decor: 0.6, particles: 80, stars: 400, farHills: true, post: true },
  low: { label: '低', dprMax: 1, shadows: false, shadowMapSize: 512, decor: 0.3, particles: 30, stars: 150, farHills: true, post: false },
};
export const DEFAULT_QUALITY = 'high';
export const DPR_HARD_MAX = 2; // 端末DPRの絶対上限

// 色の予備（biomes 側で上書きされない共通色）
export const COLORS = {
  sky: 0xe6f7ff,
  ground: 0xa5e08c,
  cliff: 0xd2b08a, // 急な面・壁の色
  ball: 0xff7a7a,
};
export const PALETTE = {
  flowers: [0xff9ec7, 0xffd36e, 0xc7a4ff, 0xffffff, 0xff9a8a, 0x9ad7ff], // 花の色（パステル）
  flowerCenter: 0xffe27a,
};

// バイオーム：距離で切り替わる。BIOME_LEN ごとに次へ進み、末尾の次は先頭に戻る（昼→夕→夜→朝）。
export const WORLD = {
  BIOME_LEN: 500,   // 1バイオームの長さ（m）
  BIOME_BLEND: 0.3, // 末尾の何割で次のバイオームへ混ざるか
  SUN_AZIM: [0.25, 0.968], // 太陽の水平方向（x, z）。+z（進行方向）寄り
  SUN_DIST: 14,     // 影用ライトの距離
  FAR_HILLS_PARALLAX: 0.85, // 遠景の丘の横ずれ（1 でカメラに固定）
};
// tree/flower/cloudW/hill：装飾の出やすさ（0〜1）。cloudLow：雲を低く大きく（雲海）。
// petals/fluff：花びら・綿毛の濃さ。stars：星の濃さ。sunElev：太陽（夜は月）の高さ(0〜1)。
export const BIOMES = [
  { name: '花畑', skyTop: 0x8fd0ff, skyHorizon: 0xe6f7ff, fog: 0xe6f7ff, fogNear: 30, fogFar: 110,
    hemiSky: 0xffffff, hemiGround: 0xa6d98a, hemiInt: 1.0, sunColor: 0xfff4d6, sunInt: 1.5, sunElev: 0.85,
    ground: 0xa5e08c, ground2: 0xc6ef9a, cliff: 0xd2b08a, foliage: 0x7fd49a, foliage2: 0xa4e07a, trunk: 0xb88a64,
    cloud: 0xffffff, petalColor: 0xffb7d5, fluffColor: 0xffffff,
    stars: 0, petals: 1, fluff: 0.35, tree: 0.55, flower: 1, cloudW: 0.35, cloudLow: 0, hill: 0.6 },
  { name: '雲海', skyTop: 0x9fc8ff, skyHorizon: 0xfdfbff, fog: 0xf4f0ff, fogNear: 30, fogFar: 110,
    hemiSky: 0xffffff, hemiGround: 0xc9c2f0, hemiInt: 1.05, sunColor: 0xffffff, sunInt: 1.3, sunElev: 0.9,
    ground: 0xdcd3ff, ground2: 0xbfe6ff, cliff: 0xe8c9e0, foliage: 0xbfe8d8, foliage2: 0xe0d0ff, trunk: 0xcfb7c9,
    cloud: 0xffffff, petalColor: 0xffffff, fluffColor: 0xffffff,
    stars: 0, petals: 0.1, fluff: 1, tree: 0.15, flower: 0.25, cloudW: 1, cloudLow: 1, hill: 0.3 },
  { name: '夕焼けの丘', skyTop: 0xb79cf0, skyHorizon: 0xffc2a0, fog: 0xffcfb0, fogNear: 25, fogFar: 105,
    hemiSky: 0xffd9c2, hemiGround: 0xc98a7a, hemiInt: 0.95, sunColor: 0xffb27a, sunInt: 1.5, sunElev: 0.17,
    ground: 0xf3c28f, ground2: 0xf7a8a0, cliff: 0xc58a7a, foliage: 0xff9f8a, foliage2: 0xf6c75e, trunk: 0x9a6a58,
    cloud: 0xffc9d6, petalColor: 0xffa86b, fluffColor: 0xffe1b0,
    stars: 0.1, petals: 1, fluff: 0.5, tree: 0.7, flower: 0.5, cloudW: 0.6, cloudLow: 0.3, hill: 1 },
  { name: '夜の星空', skyTop: 0x1b1f52, skyHorizon: 0x5a5aa8, fog: 0x4a4a92, fogNear: 20, fogFar: 95,
    hemiSky: 0x9aa8ff, hemiGround: 0x3c4488, hemiInt: 0.85, sunColor: 0xb8c4ff, sunInt: 0.6, sunElev: 0.45,
    ground: 0x7f93e6, ground2: 0x9a86e0, cliff: 0x6f6aa8, foliage: 0x6fc2c0, foliage2: 0x8fa0f0, trunk: 0x5a5a8a,
    cloud: 0xaab4ff, petalColor: 0xc9b8ff, fluffColor: 0xfff6c0,
    stars: 1, petals: 0.3, fluff: 1, tree: 0.5, flower: 0.6, cloudW: 0.4, cloudLow: 0, hill: 0.8 },
];

// カメラ：自動追従（ショットを順に切り替え、ゆるく揺れ、速いほど引いて広角に）＋手動操作（離すと自動に戻る）
export const CAMERA = {
  fov: 55, near: 0.1, far: 260,
  lookAhead: 6, lookUp: 0.3,     // 注視点を進行方向へ何m先／何m上にするか
  follow: 6, followY: 4,         // 球への追従の速さ（x／y）。大きいほどキビキビ
  shotEase: 1.4,                 // ショット切り替えのイージングの速さ（小さいほどゆったり）
  swayYaw: 0.14, swayPitch: 0.045, swayRate: 0.4, // ゆらゆら（横／縦の振れ幅 rad、速さ）
  speedRef: 40, speedDist: 2.5, speedFov: 9,     // 速いほど引く距離(m)／広がる画角(°)
  groundClear: 0.9,              // カメラが地面にめり込まない最低の高さ（m）
  // 自動ショット（yaw：0＝真後ろ、+は球の画面左側へ回る／pitch：見下ろし角 rad／dist：球までの距離 m／dur：秒）
  shots: [
    { yaw: 0, pitch: 0.38, dist: 7.5, dur: 11 },      // 追いかけ
    { yaw: 0.95, pitch: 0.22, dist: 6, dur: 9 },      // 低めの斜め
    { yaw: 0, pitch: 0.42, dist: 8, dur: 8 },
    { yaw: -0.5, pitch: 0.9, dist: 11, dur: 9 },      // 高いところから見渡す
    { yaw: 0, pitch: 0.34, dist: 7, dur: 7 },
    { yaw: 2.7, pitch: 0.2, dist: 6.5, dur: 8 },      // 前から迎える
    { yaw: 0, pitch: 0.4, dist: 7.5, dur: 8 },
    { yaw: -1.55, pitch: 0.28, dist: 6, dur: 8 },     // 真横
  ],
  // 手動操作
  dragYaw: 0.006, dragPitch: 0.005, // ドラッグ感度（rad/px）
  pitchMin: -0.15, pitchMax: 1.35,  // 見下ろし角の範囲（自動＋手動の合計）
  zoomMin: 0.45, zoomMax: 2.6,      // 寄り引きの倍率（距離に掛ける）
  wheelZoom: 0.0012, dragThreshold: 8, // ホイール感度／ドラッグとみなす距離(px)
  returnDelay: 1.5, returnRate: 2.2,   // 操作を離してから自動に戻り始めるまで(秒)／戻る速さ
};

// おむすび：丸みのある三角形の厚みのある形。単位 m（物理の球 RADIUS=0.5 に収まる大きさ）
export const ONIGIRI = {
  R0: 0.47,         // 輪郭の基準半径
  cornerAmp: 0.13,  // 三角らしさ（大きいほど角が立つ）
  thick: 0.44,      // 厚みの半分
  pillow: 0.7,      // 面のふくらみ（1＝球状、小さいほど平ら）
  segW: 88, segH: 60, // 頂点数
  noriBottom: -0.12,  // 海苔の帯の上端の高さ（m、中心から。大きいほど帯が太い）
  noriWave: 0.012,    // 帯の縁の波打ち
  noriLift: 0.012,    // 海苔の厚み（米から浮かせる量）
  rimColor: 0xffd2b0, rimStrength: 0.55, rimPower: 2.4, // ほんのりサブサーフェス風の縁の明るさ
  squashLand: 0.025, squashMax: 0.3, // 着地のつぶれ（落下速度×係数、上限）
  squashStretch: 0.003, stretchMax: 0.1, // 空中ののび
  springK: 170, springC: 13, // つぶれのバネ（硬さ、減衰）
  topY: 0.42, topZ: 0.2, // 頭の具の位置（中心から。上げるほど外に出る）
  seed: 7,          // 米粒の並びのシード
};

// 自前物理・地形生成の定数（座標系：+z が下り、+y が上。単位 m）
export const SIM = {
  DT: 1 / 120,            // 固定タイムステップ（秒）
  CHUNK_LEN: 20,          // チャンクの長さ（m、z方向）
  CHUNK_W: 48,            // チャンクの幅（m、x方向。-24〜+24）
  CELL: 2,                // 地形メッシュの格子の大きさ（m）
  AHEAD: 120,             // 球より前方に何m先までチャンクを用意するか
  BEHIND: 40,             // 球より後方何mを過ぎたらチャンクを破棄するか
  REBASE_DIST: 240,       // 原点からこの距離を超えたらフローティングオリジンで平行移動
  REBASE_STEP: 20,        // 平行移動の単位（CHUNK_LEN の倍数にすると誤差が出ない）
  SLOPE: 0.30,            // 坂の基本勾配（高さ/距離。0.30 ≒ 約17°）
  BUMP_AMP: 2.5,          // 細かいコブの高さ（m）
  BUMP_LEN_Z: 14,         // コブの波長・前後（m）
  BUMP_LEN_X: 20,         // コブの波長・左右（m）
  HILL_AMP: 3.0,          // 大きなうねりの高さ（m）
  HILL_LEN: 70,           // 大きなうねりの波長（m）
  BOWL: 0.02,             // 左右の反り（大きいほど球が中央に戻る）
  WALL_X: 16,             // 壁が立ち上がる左右位置（m）
  STUCK_TIME: 3,          // この時間(秒)のあいだ STUCK_DIST(m) も進めなければ、止まったとみなして弾み直す
  STUCK_DIST: 1.2,
  STUCK_KICK: 8,          // 弾み直しの前向きの速さ(m/s)
  EDGE_X: 21.5,           // 見えない縁（m）。障害物に弾かれても、これより外へは出ない
  WALL: 0.4,              // 壁の強さ（コースアウト防止）
  GRAVITY: 9.8,           // 重力（m/s²）
  RADIUS: 0.5,            // 球の半径（m）
  ROLL_FACTOR: 5 / 7,     // 中身の詰まった球の転がり係数（斜面加速度に掛ける）
  ROLL_RESIST: 0.02,      // 転がり抵抗係数
  AIR_DRAG: 0.002,        // 空気抵抗（速度の2乗に比例）
  RESTITUTION: 0.15,      // 着地時の跳ね返り
  STICK: 0.003,           // 地面から離れたとみなす高さ（m）。小さいほど飛びやすい
  STEER: 6,               // 左右操作の加速度（m/s²）
  MAX_SPEED: 80           // 速度の上限（m/s）。暴走防止
};

// 障害物：チャンクごとにシード付きで配置。当たるとバネで揺れて跳ね返る。
// r：半径(m)、lift：球の中心の高さ（半径に対する比。地面にめり込ませる量）、e：反発係数（1超でバネのように勢いが増す）、
// minOut：最低でもこの速さで弾き返す(m/s)、K/C：揺れのバネの硬さ・減衰、kick：衝突速度→揺れの大きさ
export const OBSTACLES = {
  slots: 4,         // 1チャンクあたりの候補数
  density: 0.4,     // 候補が実際に置かれる確率（平均 slots×density 個／20 m）
  xRange: 12,       // 左右の配置範囲（±m）
  gap: 2.2,         // 障害物どうしの表面のすき間の最小値(m)。球（直径1 m）が挟まって動けなくならないように
  edgeMargin: 2.5,  // チャンクの前後の端から空ける距離(m)。隣のチャンクの障害物とも gap を保つ
  clearStart: 24,   // スタートからこの距離までは置かない（m）
  scaleVar: 0.3,    // 大きさのばらつき（±の割合）
  types: {
    mochi:    { weight: 0.4, r: 0.95, lift: 0.5, e: 0.7,  minOut: 2.0, K: 70,  C: 3.5,  kick: 0.07 },  // もちもち：大きく長く揺れる
    mushroom: { weight: 0.3, r: 0.8,  lift: 0.7, e: 0.95, minOut: 3.5, K: 130, C: 5,    kick: 0.05 },  // ふわふわキノコ：ぽよんと強く弾く
    rock:     { weight: 0.3, r: 1.15, lift: 0.45, e: 0.25, minOut: 0.5, K: 420, C: 30,  kick: 0.012 }, // 丸岩：どっしり、少しだけ揺れる
  },
  outMax: 11,       // 跳ね返る速さの上限(m/s)。高速で当たっても吹っ飛びすぎない
  wobbleMax: 0.55,  // 揺れ（つぶれ）の最大値
};

// 分裂：おむすびが「ぽんっ」と増え、小さい子が付いて転がる。落ちたら静かにフェード、近づいたら合流して数が戻る。
export const SPLIT = {
  MAX_TOTAL: 8,       // 本体を含む上限
  FIRST_MIN: 6, FIRST_MAX: 10,       // 最初の分裂までの時間(秒)
  INTERVAL_MIN: 5, INTERVAL_MAX: 11, // 次の分裂までの間隔(秒)
  TRIPLE_CHANCE: 0.4, // 1回で2人増える（合計3個になる）確率。それ以外は1人増える
  SCALE: 0.45,        // 子の大きさ（本体＝1）。半径＝SIM.RADIUS×SCALE
  POP_UP: 4.5, POP_SIDE: 2.6,        // ぽんっと飛び出す上向き／横向きの速さ(m/s)
  POP_TIME: 0.55,     // ぽんっと膨らむ演出の長さ(秒)
  LIFE_MIN: 14, LIFE_MAX: 36,        // 子が分かれたままでいる時間(秒)。過ぎると本体に合流
  MERGE_DIST: 5,      // 寿命後、この距離以内なら合流（m）
  MERGE_TIME: 0.45,   // 合流にかかる時間(秒)
  LOST_DIST: 26,      // 本体からこれ以上離れたら「落ちた」扱いでフェード（m）
  FADE_TIME: 1.8,     // フェードの長さ(秒)
  PULL: 2.2, PULL_MAX: 9,            // 本体への引力（1/s²、最大加速度 m/s²）
  DRAG: 0.35,         // 子の速度減衰（1/s）
  MAX_SPEED: 22,      // 子の速さの上限(m/s)。本体より遅いので、速い区間で置いていかれる
  FOLLOW_BACK_MIN: 1.0, FOLLOW_BACK_MAX: 3.5, FOLLOW_SIDE: 2.0, // 付いてくる位置（本体の後ろ／左右 m）
  MAX_KIDS: 12,       // フェード中も含めた配列の上限
};

// 具・距離・ずかん・記録。確率はシードに依存しない（実行ごとの乱数で抽選する）
export const FILLING = {
  BAND_LEN: 250,       // 何 m ごとに具が変わるか
  RARE_CHANCE: 0.08,   // 距離帯が変わるとき、レア具に置き換わる確率
  EVENT_LEN: 600,      // 何 m ごとにレアイベントを抽選するか
  EVENT_CHANCE: 0.15,  // その抽選に当たる確率
  EVENT_SHOW_TIME: 4,  // イベント表示の秒数
  SAVE_INTERVAL: 1.5,  // 最長記録を保存する最短間隔（秒）
  STORAGE_KEY: 'kororin-slope:records:v1',
};

// ポストエフェクト（軽いチルトシフト・ブルーム・ヴィネット）。強さはここで調整します。
export const POST = {
  bloomScale: 0.25,      // ブルーム用バッファの解像度比（小さいほど軽くて広がる）
  bloomThreshold: 0.88,  // この明るさ以上が光る
  bloomKnee: 0.25,       // しきい値のなめらかさ
  bloomIntensity: 0.28,  // ブルームの強さ
  bloomRadius: 1.4,      // ぼかしの広がり（テクセル）
  tiltFocusY: 0.55,      // ピントの高さ（画面の上＝0、下＝1）
  tiltBand: 0.2,         // ピントが合う帯の半分の幅（画面高さ比）
  tiltStrength: 2.4,     // ぼけの強さ（最大ぼけ半径 px。0 でオフ）
  vignette: 0.32,        // ヴィネットの濃さ（0〜1）
  vignetteSoft: 0.55,    // ヴィネットの広がり
  storageKey: 'kororin-slope:post:v1',
};

// 音（WebAudio 合成のみ。外部音源なし）。音量は 0〜1。
export const AUDIO = {
  master: 0.7,           // 全体の音量
  ambient: 0.05,         // 環境音（やわらかい和音）の音量
  wind: 0.035,           // 風（ノイズ）の最大音量
  roll: 0.05,            // 転がる音の最大音量
  rollSpeedRef: 30,      // 転がる音が最大になる速さ(m/s)
  effects: 0.16,         // 効果音の音量
  landMinVy: 3,          // 着地音を鳴らす最低の落下速度(m/s)
  chord: [57, 61, 64, 68], // 環境音の和音（MIDI ノート番号。A・C#・E・G#）
  storageKey: 'kororin-slope:mute:v1',
};

// 撮影モード・シェア画像・最初の10秒
export const SHOT = {
  maxWidth: 1600,        // シェア画像の最大幅(px)
  bandRatio: 0.14,       // 下の帯の高さ（画像高さ比）
  fileName: 'kororin-slope',
  introTitleAt: 0.3, introHintAt: 2.2, introEnd: 9, // 最初の10秒：タイトル・操作ヒントが出る／消える秒
  seenKey: 'kororin-slope:seen:v1',
  loadTimeout: 12,       // この秒数のうちに起動しなければ、読み込みの案内を出す
};
