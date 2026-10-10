// Old invite links (tardigeddon.com/?room=CODE) now belong to the game at /play/.
if (location.pathname === '/' && /[?&]room=/.test(location.search)) location.replace('/play/' + location.search);
