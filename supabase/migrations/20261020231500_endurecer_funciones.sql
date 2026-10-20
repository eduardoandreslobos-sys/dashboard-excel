-- Endurece la API: ninguna función interna queda invocable desde /rest/v1/rpc salvo las dos pensadas para eso.

-- Triggers: solo los ejecuta Postgres al insertar/actualizar (el permiso EXECUTE no se revisa al dispararse).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email() from public, anon, authenticated;
revoke execute on function public.proteger_perfil() from public, anon, authenticated;
revoke execute on function public.proteger_dashboard() from public, anon, authenticated;
revoke execute on function public.auditar_dashboard() from public, anon, authenticated;
revoke execute on function public.auditar_permiso() from public, anon, authenticated;

-- Auditoría: solo la escriben los triggers y el servidor (service_role). Nadie puede inventar entradas.
revoke execute on function public.registrar(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.registrar(text, text, text, jsonb) to service_role;

-- Auxiliares de las políticas RLS: las evalúa el rol autenticado; los anónimos no las necesitan.
revoke execute on function public.es_admin() from public, anon;
revoke execute on function public.puede_ver_dashboard(uuid) from public, anon;
revoke execute on function public.puede_editar_dashboard(uuid) from public, anon;
revoke execute on function public.es_dueno_dashboard(uuid) from public, anon;
revoke execute on function public.es_miembro_espacio(uuid) from public, anon;
revoke execute on function public.dashboard_de_ruta(text) from public, anon;
grant execute on function public.es_admin() to authenticated;
grant execute on function public.puede_ver_dashboard(uuid) to authenticated;
grant execute on function public.puede_editar_dashboard(uuid) to authenticated;
grant execute on function public.es_dueno_dashboard(uuid) to authenticated;
grant execute on function public.es_miembro_espacio(uuid) to authenticated;
grant execute on function public.dashboard_de_ruta(text) to authenticated;
