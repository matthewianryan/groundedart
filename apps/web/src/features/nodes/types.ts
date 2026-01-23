export type NodePublic = {
  id: string;
  visibility: "visible";
  name: string;
  description?: string | null;
  category: string;
  lat: number;
  lng: number;
  radius_m: number;
  min_rank: number;
};

export type NodeLocked = {
  id: string;
  visibility: "locked";
  min_rank: number;
  current_rank: number;
  required_rank: number;
};

export type NodeView = NodePublic | NodeLocked;

export type NodesResponse = { nodes: NodePublic[] };

export type NodeGetResponse = { node: NodeView };
