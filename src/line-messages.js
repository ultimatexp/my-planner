export function helpText() {
  return [
    "Planner commands",
    "- task add <horizon> <importance> <urgency> <title>",
    "- task list <week|month|year>",
    "- task done <id>",
    "- task assign <id> <lineUserId>",
    "- plan add <horizon> <title>",
    "- plan list <horizon>",
    "- memory add <content>",
    "- memory list",
    "- memory forget <id>",
    "- summary <week|month|year>",
    "- menu"
  ].join("\n");
}

export function menuTemplate() {
  return {
    type: "template",
    altText: "Planner menu",
    template: {
      type: "buttons",
      title: "Planner Menu",
      text: "Quick actions",
      actions: [
        { type: "postback", label: "List Week", data: "action=list&horizon=week" },
        { type: "postback", label: "List Month", data: "action=list&horizon=month" },
        { type: "postback", label: "List Year", data: "action=list&horizon=year" },
        { type: "postback", label: "Summary Week", data: "action=summary&horizon=week" }
      ]
    }
  };
}

