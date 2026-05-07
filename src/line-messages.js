export function helpText() {
  return [
    "Planner commands",
    "- task add <horizon> <importance> <urgency> <title>",
    "  example: task add week 4 5 Finish sales report",
    "- task list <week|month|year>",
    "  example: task list week",
    "- task done <id>",
    "- task assign <id> <lineUserId>",
    "- plan add <horizon> <title>",
    "  example: plan add month Launch planner beta",
    "- plan list <horizon>",
    "- memory add <content>",
    "  example: memory add Focus on launch tasks first",
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
