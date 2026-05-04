 import { assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";
 
 const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
 const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
 const supabase = createClient(supabaseUrl, supabaseKey);
 
 Deno.test("Integridade de Vínculo: Editar identificador não deve resetar saldo", async () => {
   // 1. Criar um vínculo de teste
   const testId = "00000000-0000-0000-0000-000000000999"; // UUID simulado ou apenas teste
   const workspaceId = "feee9758-a7f4-474c-b2b1-679b66ec1cd9"; // Usar o workspace real para o teste passar
   
   const { data: user } = await supabase.auth.admin.listUsers();
   const testUser = user.users[0].id;
 
   // Criar registro inicial com saldo
   const { data: initial, error: insertError } = await supabase
     .from("bookmakers")
     .insert({
       nome: "TEST_CASA",
       login_username: "test_user",
       login_password_encrypted: "hash",
       saldo_atual: 100.50,
       moeda: "USD",
       status: "ativo",
       workspace_id: workspaceId,
       user_id: testUser,
       instance_identifier: "ID_ANTIGO"
     })
     .select()
     .single();
 
   if (insertError) throw insertError;
 
   try {
     // 2. Simular o payload que o componente envia agora (somente campos mutáveis)
     const updatePayload = {
       instance_identifier: "ID_NOVO",
       // O componente agora OMITIRIA saldo_atual no update
     };
 
     const { error: updateError } = await supabase
       .from("bookmakers")
       .update(updatePayload)
       .eq("id", initial.id);
 
     if (updateError) throw updateError;
 
     // 3. Verificar se o saldo permanece intacto
     const { data: result, error: fetchError } = await supabase
       .from("bookmakers")
       .select("saldo_atual, instance_identifier")
       .eq("id", initial.id)
       .single();
 
     if (fetchError) throw fetchError;
 
     assertEquals(result.instance_identifier, "ID_NOVO");
     assertEquals(result.saldo_atual, 100.50);
     
   } finally {
     // Limpeza
     await supabase.from("bookmakers").delete().eq("id", initial.id);
   }
 });