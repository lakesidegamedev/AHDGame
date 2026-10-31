interface DiscordGateState {
  discordLinked: boolean;
  discordRequired: boolean;
  showDiscordPrompt: boolean;
  discordPromptDismissed: boolean;
}

type DiscordGateAction =
  | { type: "linked" }
  | { type: "requirement"; required: boolean }
  | { type: "show" }
  | { type: "server-required" }
  | { type: "dismiss" };

export const initialDiscordGateState: DiscordGateState = {
  discordLinked: false,
  discordRequired: false,
  showDiscordPrompt: false,
  discordPromptDismissed: false,
};

export function discordGateReducer(
  state: DiscordGateState,
  action: DiscordGateAction
): DiscordGateState {
  switch (action.type) {
    case "linked":
      return { ...state, discordLinked: true, showDiscordPrompt: false };
    case "requirement":
      return {
        ...state,
        discordRequired: action.required,
        showDiscordPrompt: action.required && state.showDiscordPrompt,
      };
    case "show":
      return { ...state, showDiscordPrompt: true };
    case "server-required":
      return { ...state, discordLinked: false, discordRequired: true, showDiscordPrompt: true };
    case "dismiss":
      return { ...state, showDiscordPrompt: false, discordPromptDismissed: true };
  }
}
