export type NodePublic = {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  lat: number;
  lng: number;
  radius_m: number;
  min_rank: number;
};

export type NodesResponse = { nodes: NodePublic[] };

