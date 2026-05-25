TRUNCATE TABLE public.team_logos;
UPDATE public.daily_events SET home_team_logo = NULL, away_team_logo = NULL WHERE event_date >= CURRENT_DATE - INTERVAL '1 day';