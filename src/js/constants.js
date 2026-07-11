// ═══════════════════════════════════════
// constants.js — 상태 키 상수 (dot-notation)
// sSet({ [K.SCRIPT_SCR]: value }) 형태로 사용
// ═══════════════════════════════════════

export const K = {
  // nav
  NAV_STEP: 'nav.step',
  NAV_MX: 'nav.mx',

  // auth
  AUTH_USER: 'auth.user',

  // search
  SEARCH_SKW: 'search.skw',
  SEARCH_VIDS: 'search.vids',
  SEARCH_FILTER_DURATION: 'search.filterDuration',
  SEARCH_FILTER_PERIOD: 'search.filterPeriod',

  // video
  VIDEO_SV: 'video.sv',
  VIDEO_TRANSCRIPT: 'video.transcript',

  // analysis
  ANALYSIS_ANA: 'analysis.ana',

  // script
  SCRIPT_STY: 'script.sty',
  SCRIPT_SCR: 'script.scr',
  SCRIPT_SCR_DUAL: 'script.scrDual',
  SCRIPT_ES: 'script.es',
  SCRIPT_HISTORY: 'script.scriptHistory',
  SCRIPT_FCS: 'script.fcs',
  SCRIPT_FACT_CHECKED_BY: 'script.factCheckedBy',
  SCRIPT_SELECTED: 'script.selectedScripts',
  SCRIPT_RESULTS: 'script.results',
  SCRIPT_CUR_IDX: 'script.currentProcessingIdx',

  // footage
  FOOTAGE_EKW: 'footage.ekw',

  // voice
  VOICE_SEL: 'voice.selVoice',
  VOICE_SPEED: 'voice.voiceSpeed',
  VOICE_DONE: 'voice.vdone',
  VOICE_RESULT: 'voice.voiceResult',
  VOICE_EL_ID: 'voice.elVoiceId',
};
