import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify the caller is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin using their JWT
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin or super_admin role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerRolesCheck } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);
    const allowed = (callerRolesCheck || []).some((r: any) => r.role === "admin" || r.role === "super_admin");

    if (!allowed) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem criar usuários" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, full_name, role, classroom_id, school_id } = await req.json();

    if (!email || !password || !full_name || !role) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios: email, password, full_name, role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine target school: super_admin can specify any; admin uses own school
    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role, school_id")
      .eq("user_id", caller.id);
    const isSuperAdmin = (callerRoles || []).some((r: any) => r.role === "super_admin");
    const callerSchoolId = (callerRoles || []).find((r: any) => r.role !== "super_admin")?.school_id || null;

    let targetSchoolId: string | null = null;
    if (role === "super_admin") {
      targetSchoolId = null; // super admin não pertence a uma escola
    } else if (isSuperAdmin) {
      targetSchoolId = school_id || callerSchoolId;
    } else {
      targetSchoolId = callerSchoolId;
    }

    if (role !== "super_admin" && !targetSchoolId) {
      return new Response(JSON.stringify({ error: "Escola não definida para o novo usuário" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create user with admin API (won't affect caller's session)
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update profile school_id
    if (targetSchoolId) {
      await adminClient.from("profiles").update({ school_id: targetSchoolId }).eq("user_id", newUser.user.id);
    }

    // Assign role with school
    const { error: roleError } = await adminClient.from("user_roles").insert({
      user_id: newUser.user.id,
      role,
      school_id: targetSchoolId,
    });

    if (roleError) {
      return new Response(JSON.stringify({ error: `Usuário criado mas erro ao atribuir perfil: ${roleError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If teacher and classroom_id provided, link to classroom (within same school)
    if (role === "teacher" && classroom_id) {
      await adminClient
        .from("classrooms")
        .update({ teacher_user_id: newUser.user.id })
        .eq("id", classroom_id)
        .eq("school_id", targetSchoolId);
    }

    return new Response(
      JSON.stringify({ user: { id: newUser.user.id, email: newUser.user.email } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
