import random

POSITIONS = {
    "GK": "goalkeeper",
    "RB": "defender",
    "RCB": "defender",
    "LCB": "defender",
    "LB": "defender",
    "DMF": "midfielder",
    "CMF": "midfielder",
    "AMF": "midfielder",
    "RWF": "forward",
    "ST": "forward",
    "LWF": "forward",
}

ATTACK_WEIGHTS = {
    "GK": 0.05,
    "RB": 0.5,
    "RCB": 0.25,
    "LCB": 0.25,
    "LB": 0.5,
    "DMF": 0.7,
    "CMF": 1.2,
    "AMF": 2.0,
    "RWF": 2.3,
    "ST": 3.0,
    "LWF": 2.3,
}


def player_weight(player):
    return ATTACK_WEIGHTS.get(player.position, 1.0)


def choose_player(players, weights=None):
    if not players:
        raise ValueError("A team must contain players.")

    return random.choices(
        players,
        weights=weights or [1] * len(players),
        k=1,
    )[0]


def simulate_match(team1, team2):
    """
    Simulate a complete football match.

    Match flow:
        1. Regular time: 90 minutes.
        2. Extra time: 30 minutes if level after 90 minutes.
        3. Penalty shootout if level after 120 minutes.

    Penalty goals are tracked separately from regular match goals.

    Penalty events are returned in this order, all stamped minute 120:
        PENALTY_SHOOTOUT_START
        PENALTY_KICK   (shooter steps up)
        PENALTY_GOAL / PENALTY_SAVE / PENALTY_MISS   (result of that kick)
        ... repeated for every kick ...
        PENALTY_SHOOTOUT_END

    The frontend reveals these one at a time after the user presses
    the "Start Penalties" button.

    This function performs no database operations. The caller
    is responsible for saving the returned result and statistics.
    """

    if len(team1) != 11 or len(team2) != 11:
        raise ValueError("Both teams must contain exactly 11 players.")

    squads = {
        1: team1,
        2: team2,
    }

    scores = {1: 0, 2: 0}

    player_stats = {}
    team_stats = {}
    events = []

    penalty_shootout = None

    match_tempo = random.choices(
        ["LOW", "NORMAL", "HIGH"],
        weights=[15, 45, 40],
        k=1,
    )[0]

    tempo_settings = {
        "LOW": {
            "incidents": (28, 34),
            "shot_weight": 38,
            "on_target": 0.42,
            "goal_conversion": 0.25,
        },
        "NORMAL": {
            "incidents": (36, 44),
            "shot_weight": 48,
            "on_target": 0.48,
            "goal_conversion": 0.32,
        },
        "HIGH": {
            "incidents": (44, 54),
            "shot_weight": 58,
            "on_target": 0.54,
            "goal_conversion": 0.38,
        },
    }

    settings = tempo_settings[match_tempo]

    # Initialize player and team statistics.
    for team_number, squad in squads.items():

        for player in squad:
            player_stats[(team_number, player.id)] = {
                "player": player,
                "team_number": team_number,
                "rating": 6.0,
                "goals": 0,
                "assists": 0,
                "shots": 0,
                "shots_on_target": 0,
                "saves": 0,
                "tackles": 0,
                "interceptions": 0,
                "yellow_cards": 0,
                "red_cards": 0,
                "penalty_goals": 0,
                "penalty_misses": 0,
            }

        team_stats[team_number] = {
            "team_number": team_number,
            "possession": 50,
            "shots": 0,
            "shots_on_target": 0,
            "goals": 0,
            "fouls": 0,
            "corners": 0,
            "yellow_cards": 0,
            "red_cards": 0,
            "penalty_goals": 0,
            "penalty_misses": 0,
        }

    # --------------------------------------------------
    # HELPERS
    # --------------------------------------------------

    def add_event(
        minute,
        team_number,
        event_type,
        commentary,
        player=None,
        secondary_player=None,
        penalty_round=None,
        is_sudden_death=False,
    ):
        events.append({
            "minute": minute,
            "team_number": team_number,
            "event_type": event_type,
            "commentary": commentary[:255],
            "player": player,
            "secondary_player": secondary_player,
            "penalty_round": penalty_round,
            "is_sudden_death": is_sudden_death,
        })

    def get_player_stats(team_number, player):
        key = (team_number, player.id)

        if key not in player_stats:
            raise ValueError(
                f"Player {player.id} ({player.name}) is not registered "
                f"in team {team_number}'s match statistics."
            )

        return player_stats[key]

    # --------------------------------------------------
    # MATCH INCIDENTS
    # --------------------------------------------------

    def simulate_incident(minute, extra_time=False):

        team_number = random.choice([1, 2])
        opponent_number = 2 if team_number == 1 else 1

        squad = squads[team_number]
        opponent = squads[opponent_number]

        stats = team_stats[team_number]
        opponent_stats = team_stats[opponent_number]

        attackers = [
            player
            for player in squad
            if player.position in ("ST", "RWF", "LWF", "AMF", "CMF")
        ] or squad

        defenders = [
            player
            for player in opponent
            if player.position in ("RB", "RCB", "LCB", "LB", "DMF", "CMF")
        ] or opponent

        incident = random.choices(
            [
                "SHOT",
                "TACKLE",
                "INTERCEPTION",
                "FOUL",
                "CORNER",
                "OFFSIDE",
            ],
            weights=[
                settings["shot_weight"],
                18,
                11,
                11,
                12,
                4,
            ],
            k=1,
        )[0]

        if incident == "SHOT":

            shooter = choose_player(
                attackers,
                [player_weight(player) for player in attackers],
            )

            shooter_stats = get_player_stats(team_number, shooter)

            shooter_stats["shots"] += 1
            stats["shots"] += 1

            on_target_probability = settings["on_target"]

            if extra_time:
                on_target_probability += 0.03

            on_target = random.random() < min(
                on_target_probability,
                0.70,
            )

            if on_target:
                shooter_stats["shots_on_target"] += 1
                stats["shots_on_target"] += 1

            if on_target:

                goal_probability = settings["goal_conversion"]

                if minute >= 75:
                    goal_probability += 0.08

                if minute >= 85:
                    goal_probability += 0.07

                if (
                    minute >= 75
                    and scores[team_number] < scores[opponent_number]
                ):
                    goal_probability += 0.07

                if (
                    minute >= 85
                    and scores[team_number] < scores[opponent_number]
                ):
                    goal_probability += 0.08

                if extra_time:
                    goal_probability += 0.04

                goal_probability = min(goal_probability, 0.65)

            else:
                goal_probability = 0.0

            if on_target and random.random() < goal_probability:

                scores[team_number] += 1
                stats["goals"] += 1

                shooter_stats["goals"] += 1
                shooter_stats["rating"] += 1.4

                assist = None

                if random.random() < 0.72:

                    possible_assists = [
                        player
                        for player in squad
                        if player.id != shooter.id
                        and player.position != "GK"
                    ]

                    if possible_assists:

                        assist = choose_player(possible_assists)

                        assist_stats = get_player_stats(
                            team_number,
                            assist,
                        )

                        assist_stats["assists"] += 1
                        assist_stats["rating"] += 0.5

                normal_phrases = [
                    f"GOAL! {shooter.name} finds the back of the net!",
                    f"What a finish! {shooter.name} scores!",
                    f"Brilliant attacking play ends with {shooter.name} scoring!",
                    f"The crowd erupts as {shooter.name} puts it away!",
                    f"{shooter.name} makes no mistake in front of goal!",
                ]

                golazo_phrases = [
                    f"GOLAZO! {shooter.name} unleashes an absolute rocket!",
                    f"WHAT A GOAL! {shooter.name} scores a stunning long-range strike!",
                    f"An unbelievable finish! {shooter.name} produces a moment of magic!",
                    f"Top corner! {shooter.name} scores a world-class screamer!",
                ]

                if random.random() < 0.10:
                    commentary = random.choice(golazo_phrases)
                else:
                    commentary = random.choice(normal_phrases)

                if (
                    minute >= 85
                    and scores[team_number] == scores[opponent_number]
                ):
                    commentary = (
                        f"LATE EQUALIZER! {shooter.name} brings the teams level!"
                    )

                elif (
                    minute >= 85
                    and scores[team_number] > scores[opponent_number]
                ):
                    commentary = (
                        f"LATE WINNER! {shooter.name} puts the team in front!"
                    )

                add_event(
                    minute,
                    team_number,
                    "GOAL",
                    commentary,
                    shooter,
                    assist,
                )

            elif on_target:

                goalkeeper = next(
                    (
                        player
                        for player in opponent
                        if player.position == "GK"
                    ),
                    opponent[0],
                )

                goalkeeper_stats = get_player_stats(
                    opponent_number,
                    goalkeeper,
                )

                goalkeeper_stats["saves"] += 1
                goalkeeper_stats["rating"] += 0.25

                add_event(
                    minute,
                    team_number,
                    "SAVE",
                    (
                        f"{shooter.name} tests the goalkeeper, "
                        "who makes an excellent save!"
                    ),
                    shooter,
                    goalkeeper,
                )

            else:

                add_event(
                    minute,
                    team_number,
                    "SHOT",
                    f"{shooter.name} takes aim, but the effort goes wide.",
                    shooter,
                )

        elif incident == "TACKLE":

            tackler = choose_player(defenders)

            tackler_stats = get_player_stats(
                opponent_number,
                tackler,
            )

            tackler_stats["tackles"] += 1
            tackler_stats["rating"] += 0.12

            add_event(
                minute,
                opponent_number,
                "TACKLE",
                (
                    f"{tackler.name} times the challenge perfectly "
                    "and wins the ball."
                ),
                tackler,
            )

        elif incident == "INTERCEPTION":

            interceptor = choose_player(defenders)

            interceptor_stats = get_player_stats(
                opponent_number,
                interceptor,
            )

            interceptor_stats["interceptions"] += 1
            interceptor_stats["rating"] += 0.12

            add_event(
                minute,
                opponent_number,
                "INTERCEPTION",
                f"{interceptor.name} reads the pass and intercepts it.",
                interceptor,
            )

        elif incident == "FOUL":

            offender = choose_player(defenders)

            offender_stats = get_player_stats(
                opponent_number,
                offender,
            )

            opponent_stats["fouls"] += 1
            offender_stats["rating"] -= 0.12

            if random.random() < 0.18:

                offender_stats["yellow_cards"] += 1
                opponent_stats["yellow_cards"] += 1

                add_event(
                    minute,
                    opponent_number,
                    "YELLOW_CARD",
                    (
                        f"The referee books {offender.name} "
                        "for a late challenge."
                    ),
                    offender,
                )

            else:

                add_event(
                    minute,
                    opponent_number,
                    "FOUL",
                    f"{offender.name} gives away a free kick.",
                    offender,
                )

        elif incident == "CORNER":

            stats["corners"] += 1

            taker = choose_player(attackers)

            add_event(
                minute,
                team_number,
                "CORNER",
                f"{taker.name} prepares to deliver the corner.",
                taker,
            )

        else:

            runner = choose_player(attackers)

            add_event(
                minute,
                team_number,
                "OFFSIDE",
                f"The flag goes up against {runner.name} for offside.",
                runner,
            )

    # --------------------------------------------------
    # PENALTY SHOOTOUT
    # --------------------------------------------------

    def simulate_penalty_shootout():

        penalty_scores = {
            1: 0,
            2: 0,
        }

        attempts = {
            1: 0,
            2: 0,
        }

        penalty_events = []

        shooters = {
            1: team1.copy(),
            2: team2.copy(),
        }

        random.shuffle(shooters[1])
        random.shuffle(shooters[2])

        goalkeepers = {
            1: next(p for p in team1 if p.position == "GK"),
            2: next(p for p in team2 if p.position == "GK"),
        }

        add_event(
            120,
            0,
            "PENALTY_SHOOTOUT_START",
            "The teams are still level! It's time for a penalty shootout.",
        )

        def take_penalty(team_number, round_number, sudden_death=False):

            opponent_number = 2 if team_number == 1 else 1

            shooter = shooters[team_number][attempts[team_number] % 11]

            goalkeeper = goalkeepers[opponent_number]

            attempts[team_number] += 1

            shooter_stats = get_player_stats(
                team_number,
                shooter,
            )

            goalkeeper_stats = get_player_stats(
                opponent_number,
                goalkeeper,
            )

            # Show the penalty taker before revealing the result.
            add_event(
                120,
                team_number,
                "PENALTY_KICK",
                (
                    f"{shooter.name} steps up to take the penalty. "
                    f"{goalkeeper.name} is ready in goal."
                ),
                shooter,
                goalkeeper,
                penalty_round=round_number,
                is_sudden_death=sudden_death,
            )

            # A penalty can be scored, saved or missed.
            outcome = random.choices(
                ["GOAL", "SAVE", "MISS"],
                weights=[76, 16, 8],
                k=1,
            )[0]

            if outcome == "GOAL":

                penalty_scores[team_number] += 1

                shooter_stats["penalty_goals"] += 1
                team_stats[team_number]["penalty_goals"] += 1

                shooter_stats["rating"] += 0.15

                event_type = "PENALTY_GOAL"

                commentary = (
                    f"GOAL! {shooter.name} converts the penalty!"
                )

            elif outcome == "SAVE":

                shooter_stats["penalty_misses"] += 1
                team_stats[team_number]["penalty_misses"] += 1

                goalkeeper_stats["saves"] += 1
                goalkeeper_stats["rating"] += 0.2

                event_type = "PENALTY_SAVE"

                commentary = (
                    f"SAVED! {goalkeeper.name} denies "
                    f"{shooter.name} from the spot!"
                )

            else:

                shooter_stats["penalty_misses"] += 1
                team_stats[team_number]["penalty_misses"] += 1

                event_type = "PENALTY_MISS"

                commentary = (
                    f"MISSED! {shooter.name} fails to convert "
                    "the penalty!"
                )

            penalty_events.append({
                "round": round_number,
                "team_number": team_number,
                "shooter": shooter,
                "goalkeeper": goalkeeper,
                "outcome": outcome,
                "score": penalty_scores.copy(),
                "sudden_death": sudden_death,
            })

            add_event(
                120,
                team_number,
                event_type,
                commentary,
                shooter,
                goalkeeper,
                penalty_round=round_number,
                is_sudden_death=sudden_death,
            )

        def regulation_shootout_decided():
            """
            True when one team can no longer be caught within the
            first five kicks each. Checked after every single kick.
            """
            remaining1 = max(0, 5 - attempts[1])
            remaining2 = max(0, 5 - attempts[2])

            return (
                penalty_scores[1] > penalty_scores[2] + remaining2
                or penalty_scores[2] > penalty_scores[1] + remaining1
            )

        # First five rounds: one kick per team per round.
        decided_early = False

        for round_number in range(1, 6):

            for team_number in (1, 2):

                take_penalty(team_number, round_number)

                if regulation_shootout_decided():
                    decided_early = True
                    break

            if decided_early:
                break

        # Sudden death: one kick per team per round until separated.
        if not decided_early and penalty_scores[1] == penalty_scores[2]:

            round_number = 6

            while True:

                take_penalty(1, round_number, sudden_death=True)
                take_penalty(2, round_number, sudden_death=True)

                if penalty_scores[1] != penalty_scores[2]:
                    break

                round_number += 1

        winner = (
            1 if penalty_scores[1] > penalty_scores[2] else 2
        )

        add_event(
            120,
            winner,
            "PENALTY_SHOOTOUT_END",
            (
                f"Penalty shootout finished! "
                f"Team {winner} wins "
                f"{penalty_scores[1]}-{penalty_scores[2]}."
            ),
        )

        return {
            "team1_score": penalty_scores[1],
            "team2_score": penalty_scores[2],
            "winner_number": winner,
            "total_rounds": max(
                (attempt["round"] for attempt in penalty_events),
                default=0,
            ),
            "sudden_death": attempts[1] > 5 or attempts[2] > 5,
            "attempts": penalty_events,
        }

    # --------------------------------------------------
    # REGULAR MATCH
    # --------------------------------------------------

    add_event(
        1,
        0,
        "KICKOFF",
        "The referee blows the whistle. We are underway!",
    )

    incident_count = random.randint(*settings["incidents"])
    # incident_count = 0

    incident_minutes = sorted(
        random.sample(range(2, 90), incident_count)
    )

    for minute in incident_minutes:
        simulate_incident(minute)

    add_event(
        45,
        0,
        "HALFTIME",
        "The referee signals halftime.",
    )

    # --------------------------------------------------
    # EXTRA TIME
    # --------------------------------------------------

    extra_time_played = scores[1] == scores[2]

    if extra_time_played:

        add_event(
            90,
            0,
            "EXTRA_TIME_START",
            "The teams are level! Extra time begins.",
        )

        # First extra-time half: minutes 91-105.
        first_extra_count = random.randint(8, 11)
        # first_extra_count = 0

        first_extra_minutes = sorted(
            random.sample(range(91, 106), first_extra_count)
        )

        for minute in first_extra_minutes:
            simulate_incident(minute, extra_time=True)

        add_event(
            105,
            0,
            "EXTRA_TIME_HALFTIME",
            "The first period of extra time ends.",
        )

        # Second extra-time half: minutes 106-120.
        second_extra_count = random.randint(8, 11)
        # second_extra_count = 0

        second_extra_minutes = sorted(
            random.sample(range(106, 121), second_extra_count)
        )

        for minute in second_extra_minutes:
            simulate_incident(minute, extra_time=True)

        add_event(
            120,
            0,
            "FULLTIME",
            "Full-time after extra time! The match is over.",
        )

    else:

        add_event(
            90,
            0,
            "FULLTIME",
            "Full-time! The match is over.",
        )

    # --------------------------------------------------
    # PENALTIES IF STILL LEVEL
    # --------------------------------------------------

    if scores[1] == scores[2]:
        penalty_shootout = simulate_penalty_shootout()

    # --------------------------------------------------
    # FINAL MATCH RESULT
    # --------------------------------------------------

    if penalty_shootout:

        winner_number = penalty_shootout["winner_number"]

    elif scores[1] > scores[2]:

        winner_number = 1

    elif scores[2] > scores[1]:

        winner_number = 2

    else:

        winner_number = 0

    # Sort events chronologically.
    # Python's sort is stable, so events with the same minute
    # (including every penalty event at minute 120) keep the
    # order in which they were added.
    events.sort(key=lambda event: event["minute"])

    for number, event in enumerate(events, start=1):
        event["event_number"] = number

    # Possession always totals 100%.
    possession1 = random.randint(38, 62)

    team_stats[1]["possession"] = possession1
    team_stats[2]["possession"] = 100 - possession1

    # --------------------------------------------------
    # PLAYER RATINGS AND MAN OF THE MATCH
    # --------------------------------------------------

    motm_key = None
    best_score = float("-inf")

    for key, stats in player_stats.items():

        player = stats["player"]

        stats["rating"] += random.uniform(-0.35, 0.35)

        if player.position == "GK":
            stats["rating"] += 0.15

        if stats["goals"]:
            stats["rating"] += stats["goals"] * 0.4

        if stats["assists"]:
            stats["rating"] += stats["assists"] * 0.3

        if stats["yellow_cards"]:
            stats["rating"] -= stats["yellow_cards"] * 0.4

        # Penalty shootout contributions.
        if stats["penalty_goals"]:
            stats["rating"] += stats["penalty_goals"] * 0.1

        if stats["penalty_misses"]:
            stats["rating"] -= stats["penalty_misses"] * 0.05

        stats["rating"] = round(
            max(4.5, min(10.0, stats["rating"])),
            1,
        )

        performance = (
            stats["rating"]
            + stats["goals"] * 1.2
            + stats["assists"] * 0.7
            + stats["saves"] * 0.08
            + stats["penalty_goals"] * 0.15
        )

        if performance > best_score:

            best_score = performance
            motm_key = key

    # --------------------------------------------------
    # FINAL RESPONSE
    # --------------------------------------------------

    return {
        "player1_score": scores[1],
        "player2_score": scores[2],
        "winner_number": winner_number,
        "extra_time_played": extra_time_played,
        "penalty_shootout": penalty_shootout,
        "events": events,
        "team_statistics": list(team_stats.values()),
        "player_ratings": list(player_stats.values()),
        "man_of_the_match": player_stats[motm_key]["player"],
    }