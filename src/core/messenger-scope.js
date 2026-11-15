// React may retain the previous conversation's DOM while the URL changes.
// Never reassign the same rendered message node to another conversation.
export function createMessengerScope() {
  const owners = new WeakMap();
  return (node, conversation) => {
    if (!conversation) return false;
    const id = node.getAttribute('data-message-id');
    if (!id) return false;
    const previous = owners.get(node);
    if (previous?.id === id && previous.conversationId !== conversation.conversationId) return false;
    owners.set(node, {id, conversationId:conversation.conversationId});
    return true;
  };
}
