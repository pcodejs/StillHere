// The rendered E2EE ID gains the recipient prefix once sending finishes.
export function messengerMessageId(value) {
  return /^\d+@msgr\.(\d+)$/.exec(value)?.[1] || value;
}
