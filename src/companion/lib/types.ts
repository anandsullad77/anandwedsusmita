export type Theme = {
  primary: string;      // couple's main colour
  deep: string;         // dark ground
  paper: string;        // background
  card: string;
  ink: string;
  muted: string;
  akshate?: string;     // platform constant
};

export type EventInfo = {
  id: string;
  slug: string;
  title: string;
  coupleA: string;
  coupleB: string;
  startsAt: string;
  venue: string;
  mapUrl?: string;
  hostWhatsapp?: string;
  theme: Partial<Theme> & { monogram?: string; portrait?: string; place?: string; travelPoints?: Partial<Record<'train' | 'bus' | 'car' | 'flight', string>> };
};

export type Fn = { id: string; nameEn: string; nameKn?: string; startsAt: string; venue?: string };

export type Person = {
  id: string;
  name: string;
  relation?: string | null;
  isChild: boolean;
  attending: string[];
  linked?: boolean;
  phone?: string | null;      // host views only
  addedBy?: 'host' | 'guest';
  arrivedAt?: string | null;
};

export type Travel = { mode: 'train' | 'bus' | 'car' | 'flight' | 'near'; point?: string; window?: string };
export type Stay = { nights: string[]; manage: boolean };

export type Household = {
  invitationType?: 'individual' | 'family';
  id: string;
  name: string;
  token?: string;
  cap: number;
  coming: 'yes' | 'no' | null;
  travel: Travel | null;
  stay: Stay | null;
  blessing?: string | null;
  updatedAt: string;
  side?: string | null;
  invitedBy?: string | null;
  inviteStatus?: 'not_sent' | 'sent' | 'opened' | 'responded';
  source?: 'list' | 'open';
  functionIds?: string[];
};

export type InviteBundle = { event: EventInfo; functions: Fn[]; household: Household; people: Person[] };
export type GeneralSections = { cover: boolean; schedule: boolean; photos: boolean; uploads: boolean; updates: boolean; guestbook: boolean; download: boolean; quests: boolean; nostalgia: boolean; playground: boolean };
export type InvitationPreviewPhoto = { path: string | null; url: string | null };
export type GeneralInvitationSettings = { welcomeMessage: string; coverPath: string | null; coverUrl: string | null; previewPhotos: InvitationPreviewPhoto[]; sections: GeneralSections };
export type GeneralInviteBundle = { event: EventInfo; functions: Fn[]; guestName: string | null; settings?: GeneralInvitationSettings };
export type WishStatus = 'pending' | 'approved' | 'rejected';
export type Wish = { id: string; name: string; message: string; status: WishStatus; createdAt: string };

export type PhotoContext = {
  b: Pick<InviteBundle, 'event' | 'functions'>;
  me: { id: string | null; name: string } | undefined;
  scenePath?: string;
  generalToken?: string;
  questsEnabled?: boolean;
  prepareUpload?: (name: string) => Promise<void>;
};

export type Session = { eventId: string; slug: string; householdToken: string; personId: string; invitationType?: 'individual' | 'family' };

export type Change = { byName: string; summary: string; at: string };

export type ReactionKind = 'akshate' | 'love' | 'wow' | 'celebrate';
export type ReactionCounts = Record<ReactionKind, number>;
export type Photo = {
  id: string;
  postId?: string | null;
  postPosition?: number | null;
  uploaderName: string;
  url: string;
  moment?: string | null;
  questId?: string | null;
  caption?: string | null;
  createdAt: string;
  akshate: number;
  mine: boolean;        // did I shower akshate
  reactionCounts: ReactionCounts;
  myReaction: ReactionKind | null;
  uploadedByMe: boolean;
  pinned: boolean;
  hidden: boolean;
  status?: WishStatus;
  reportLocked?: boolean;
  flags?: number;
};

export type PostReviewFilter = 'review' | 'feed' | 'hidden' | 'all';
export type PostReviewPhoto = { id: string; path: string; url?: string; caption: string | null; moment: string | null; questId: string | null;
  hidden: boolean; status: WishStatus; reports: { reason: string | null; removal: boolean; createdAt: string }[] };
export type PostReview = { id: string; kind: 'photo' | 'wish'; name: string; text: string | null; status: WishStatus;
  hidden: boolean; flags: number; createdAt: string; reviewedAt: string | null; photos: PostReviewPhoto[] };
export type PostReviewOptions = { filter?: PostReviewFilter; kind?: 'all' | 'photo' | 'wish'; query?: string; questId?: string; offset?: number; limit?: number };
export type PostReviewQueue = { canReview: boolean; total: number; posts: PostReview[];
  counts: Record<PostReviewFilter | 'pending' | 'reported', number> };

export type Announcement = { id: string; body: string; at: string };
export type PhotoMeta = { moment?: string; questId?: string; caption?: string; uploaderName: string; personId: string | null };
export type PostImage = { id: string; blob: Blob };
export type PhotoQuestSummary = { contributions: number; completedQuestIds: string[]; counts: Record<string, number> };

export type RsvpPayload = {
  coming?: 'yes' | 'no';
  attendance?: { personId: string; functionIds: string[] }[];
  add?: { name: string; relation?: string; isChild?: boolean; functionIds?: string[] }[];
  travel?: Travel | null;
  stay?: Stay | null;
  blessing?: string;
  requestId?: string;
  summary: string;
};

export type ListMatch = { personId: string; name: string; household: string; householdToken: string };

export type AdminHousehold = Household & { people: Person[] };

export type AnalyticsPost = {
  id: string; kind: 'photo' | 'wish'; name: string; text: string | null;
  photos: number; createdAt: string; status: string; url?: string;
};
export type AdminAnalytics = { visitors: number; signedIn: number; photoPosts: number; wishes: number; recentPosts: AnalyticsPost[] };

export type GuestContact = {
  id: string; name: string; email: string | null;
  firstSeenAt: string | null; lastActiveAt: string | null;
  firstSignedInAt: string | null; lastSignedInAt: string | null;
  photoPosts: number; photos: number; wishes: number; reactions: number;
};
export type GuestMemoryPhoto = { id: string; path: string; caption: string | null; moment: string | null; questId: string | null; hidden: boolean; url?: string };
export type GuestMemoryPost = {
  id: string; guestId: string; name: string; email: string | null; author: string;
  kind: 'photo' | 'wish'; text: string | null; photos: GuestMemoryPhoto[]; createdAt: string; status: string;
};
export type GuestDirectory = { total: number; guests: GuestContact[] };
export type GuestMemoryPosts = { total: number; posts: GuestMemoryPost[] };

export type HostRole = 'owner' | 'cohost' | 'planner' | 'photographer';
export type HostTeamMember = { id: string; name: string; email: string | null; role: HostRole; confirmed: boolean };
export type HostTeam = { currentUserId: string; canManage: boolean; members: HostTeamMember[] };
export type HostTeamAction = { action: 'invite'; name: string; email: string; role: 'owner' | 'cohost' } | { action: 'reset'; userId: string };
export type HostTeamResult = { accessAdded: boolean; emailSent: boolean; message: string };

export type HouseholdImport = {
  invitationType?: 'individual' | 'family';
  name: string;
  side: string | null;
  invitedBy: string | null;
  cap: number;
  functionIds: string[];
  people: { name: string; phone: string | null; isChild: boolean }[];
};

export type HouseholdImportResult = { created: number; skipped: number };

export type AdminData = {
  event: EventInfo;
  pin: string;
  generalToken: string;
  functions: Fn[];
  households: AdminHousehold[];
  photos: Photo[];
  postsToReview?: number;
  announcements: Announcement[];
  requests: { id: string; name: string; phone?: string | null; note?: string | null; status: string; at: string }[];
};

export interface Backend {
  kind: 'local' | 'supabase';
  weddingInvite(name?: string): Promise<{ token: string; bundle: GeneralInviteBundle } | null>;
  // guests
  inviteBundle(token: string): Promise<InviteBundle | null>;
  generalInvite(token: string, name?: string): Promise<GeneralInviteBundle | null>;
  generalSettings(eventId: string): Promise<GeneralInvitationSettings>;
  saveGeneralSettings(eventId: string, settings: GeneralInvitationSettings, cover?: Blob, previews?: (Blob | null)[]): Promise<void>;
  listWishes(eventId: string, moderation?: boolean): Promise<Wish[]>;
  submitWish(token: string, name: string, message: string, requestId: string): Promise<void>;
  moderateWish(eventId: string, wishId: string, status: WishStatus): Promise<void>;
  claimPerson(token: string, personId: string | null, newName?: string, relation?: string): Promise<string>;
  findOnList(slug: string, pin: string, query: string, phone?: string): Promise<ListMatch[]>;
  openJoin(slug: string, pin: string, householdName: string, people: { name: string; relation?: string; isChild?: boolean }[], phone?: string): Promise<{ householdToken: string; personId: string }>;
  requestAccess(slug: string, name: string, phone: string, note: string): Promise<void>;
  saveRsvp(eventId: string, payload: RsvpPayload): Promise<void>;
  changes(householdId: string): Promise<Change[]>;
  listPhotos(eventId: string, options?: { questId?: string; includeHidden?: boolean; preview?: boolean }): Promise<Photo[]>;
  photoQuestSummary(eventId: string): Promise<PhotoQuestSummary>;
  uploadPhoto(eventId: string, blob: Blob, meta: { moment?: string; questId?: string; caption?: string; uploaderName: string; personId: string | null }): Promise<void>;
  uploadPhotoPost(eventId: string, postId: string, images: PostImage[], meta: PhotoMeta): Promise<void>;
  toggleAkshate(photoId: string): Promise<void>;
  setPhotoReaction(photoId: string, reaction: ReactionKind | null): Promise<void>;
  // Send a report/removal request for host review; never hide or delete the photo.
  flagPhoto(photoId: string, reason: string, removal: boolean): Promise<void>;
  announcements(eventId: string): Promise<Announcement[]>;
  markArrived(eventId: string): Promise<void>;
  // hosts
  hostSignIn(email: string, password: string): Promise<boolean>;
  hostEvents(): Promise<EventInfo[]>;
  hostTeam(eventId: string): Promise<HostTeam>;
  manageHostTeam(eventId: string, action: HostTeamAction): Promise<HostTeamResult>;
  adminData(eventId: string): Promise<AdminData>;
  postReviewQueue(eventId: string, options?: PostReviewOptions): Promise<PostReviewQueue>;
  reviewPosts(eventId: string, posts: Pick<PostReview, 'id' | 'kind'>[], action: 'approve' | 'hide'): Promise<void>;
  adminAnalytics(eventId: string): Promise<AdminAnalytics>;
  adminGuests(eventId: string, options?: { query?: string; offset?: number; limit?: number }): Promise<GuestDirectory>;
  adminGuestPosts(eventId: string, options?: { guestId?: string; offset?: number; limit?: number; includeUrls?: boolean }): Promise<GuestMemoryPosts>;
  saveHousehold(eventId: string, hh: Partial<AdminHousehold> & { name: string }, people: Partial<Person>[]): Promise<void>;
  deleteHousehold(eventId: string, householdId: string): Promise<void>;
  importHouseholds(eventId: string, households: HouseholdImport[]): Promise<HouseholdImportResult>;
  setInviteStatus(householdId: string, status: Household['inviteStatus']): Promise<void>;
  setPhoto(photoId: string, patch: { hidden?: boolean; pinned?: boolean }): Promise<void>;
  deletePhoto(photoId: string): Promise<void>;
  postAnnouncement(eventId: string, body: string): Promise<void>;
  setPin(eventId: string, pin: string): Promise<void>;
}
