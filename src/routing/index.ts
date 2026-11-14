// Public surface of the routing module (OWNER: Ayush). The worker imports only from here.
export {
  MODEL_VERSION,
  EVA_LIMITS,
  EVA_POLICY_WEIGHTS,
  worseQuality,
  qualityPenalty,
  computeEdgeCost,
  isCellAdmissible,
  solveRoute,
  type RoutingGrid,
  type SolveHooks,
  type PolicyWeights,
} from './evaEngine';
