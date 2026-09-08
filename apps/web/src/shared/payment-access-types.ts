export type PaymentAccessOverview = {
  organizationName: string;
  role: "ADMIN";
  operators: {
    id: string;
    displayName: string;
    activatedAt: string;
  }[];
  invitations: {
    id: string;
    inviteeLabel: string;
    status: "PENDING" | "EXPIRED";
    expiresAt: string;
    createdAt: string;
  }[];
  activity: {
    id: string;
    type:
      | "INVITED"
      | "INVITATION_REVOKED"
      | "INVITATION_EXPIRED"
      | "JOINED"
      | "REINSTATED"
      | "REMOVED"
      | "LEFT";
    label: string;
    createdAt: string;
  }[];
};

export type InvitationLinkResult = {
  invitation: PaymentAccessOverview["invitations"][number];
  invitationUrl: string;
};

export type InvitationReview =
  | {
      state: "VALID";
      authenticated: false;
    }
  | {
      state: "VALID" | "ALREADY_MEMBER" | "ALREADY_ACCEPTED";
      authenticated: true;
      organizationName: string;
      expiresAt: string;
      needsDisplayName: boolean;
      workspaceId: string;
    }
  | {
      state: "EXPIRED" | "REVOKED" | "UNAVAILABLE";
      authenticated: boolean;
    };

export type InvitationAcceptance =
  | {
      state: "ACCEPTED" | "ALREADY_ACCEPTED" | "ALREADY_MEMBER";
      organizationName: string;
      workspaceId: string;
    }
  | { state: "NAME_REQUIRED" | "EXPIRED" | "REVOKED" | "UNAVAILABLE" };
