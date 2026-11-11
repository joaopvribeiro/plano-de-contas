-- ============================================================================
-- Storage privado
-- Bucket único "familias". Todo arquivo fica em <familia_id>/<pasta>/<arquivo>.
-- A política lê o familia_id do primeiro segmento do caminho.
-- Downloads só por URL assinada de curta duração (gerada no servidor).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'familias', 'familias', false, 20971520,
  array[
    'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic',
    'text/csv', 'application/x-ofx', 'application/ofx', 'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

-- Converte o primeiro segmento do caminho em uuid sem estourar erro.
create or replace function public.familia_do_caminho(p_nome text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return (string_to_array(p_nome, '/'))[1]::uuid;
exception when others then
  return null;
end $$;

grant execute on function public.familia_do_caminho(text) to authenticated, service_role;

create policy "familia_le_arquivos" on storage.objects
  for select to authenticated
  using (bucket_id = 'familias' and public.pode_acessar_familia(public.familia_do_caminho(name)));

create policy "familia_envia_arquivos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'familias' and public.pode_acessar_familia(public.familia_do_caminho(name)));

create policy "familia_altera_arquivos" on storage.objects
  for update to authenticated
  using (bucket_id = 'familias' and public.pode_acessar_familia(public.familia_do_caminho(name)))
  with check (bucket_id = 'familias' and public.pode_acessar_familia(public.familia_do_caminho(name)));

create policy "familia_apaga_arquivos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'familias' and public.pode_acessar_familia(public.familia_do_caminho(name)));
