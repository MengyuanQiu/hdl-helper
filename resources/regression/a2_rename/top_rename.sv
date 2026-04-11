module top_rename;
    logic [7:0] a;
    logic [7:0] b;
    logic [8:0] y;

    // Module type should change with rename, instance name should not.
    adder_core u_adder_core (
        .a(a),
        .b(b),
        .y(y)
    );
endmodule
