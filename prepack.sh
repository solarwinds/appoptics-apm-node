[ "" = "$(ls ubuntu*)" ] && exit 0

echo "there are ubuntu* files; please delete or move them"
exit 1
